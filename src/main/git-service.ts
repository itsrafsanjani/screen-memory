import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { basename, join } from 'path'
import { homedir } from 'os'
import { insertGitCommit, insertGitRepo, getGitRepos, updateGitRepo } from './db/repositories/git'
import { getSetting, setSetting } from './db/repositories/settings'
import {
  DEFAULT_GIT_SCAN_INTERVAL_MINUTES,
  DEFAULT_GIT_POLL_INTERVAL_MINUTES,
  GIT_POLL_STARTUP_DELAY_MS,
  GIT_SCAN_TIMEOUT_MS,
  GIT_REPO_CHECK_TIMEOUT_MS,
  GIT_LOG_TIMEOUT_MS,
  GIT_LOG_MAX_BUFFER,
  GIT_INITIAL_HISTORY_DAYS,
  MS_PER_DAY
} from '../shared/constants'
import { parseWatchDirs } from './settings-validation'

const DEFAULT_WATCH_DIRS = ['Projects', 'Code', 'Developer', 'Desktop', 'Documents'].map((d) =>
  join(homedir(), d)
)
const EXCLUDE_PATTERNS = ['node_modules', '.Trash', 'Library', '.cache', '.npm']

export class GitService {
  private scanTimer: ReturnType<typeof setInterval> | null = null
  private pollTimer: ReturnType<typeof setInterval> | null = null

  start(
    scanIntervalMinutes = DEFAULT_GIT_SCAN_INTERVAL_MINUTES,
    pollIntervalMinutes = DEFAULT_GIT_POLL_INTERVAL_MINUTES
  ): void {
    // Initial scan
    this.scanRepos().catch(console.error)

    // Schedule periodic repo discovery
    this.scanTimer = setInterval(
      () => this.scanRepos().catch(console.error),
      scanIntervalMinutes * 60 * 1000
    )

    // Schedule periodic commit polling
    this.pollTimer = setInterval(
      () => this.pollAllRepos().catch(console.error),
      pollIntervalMinutes * 60 * 1000
    )

    // Poll once after a short delay for initial commits
    setTimeout(() => this.pollAllRepos().catch(console.error), GIT_POLL_STARTUP_DELAY_MS)
  }

  stop(): void {
    if (this.scanTimer) {
      clearInterval(this.scanTimer)
      this.scanTimer = null
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  async scanRepos(): Promise<void> {
    const watchDirsStr = getSetting('git.watchDirs')
    const watchDirs: string[] = watchDirsStr ? parseWatchDirs(watchDirsStr) : DEFAULT_WATCH_DIRS

    for (const dir of watchDirs) {
      if (!existsSync(dir)) continue

      try {
        const gitDirs = await this.findGitRepos(dir)
        for (const gitDir of gitDirs) {
          const repoPath = gitDir.replace(/\/\.git$/, '')
          const repoName = basename(repoPath)
          insertGitRepo({ path: repoPath, name: repoName })
        }
      } catch (err) {
        console.error(`Error scanning ${dir}:`, err)
      }
    }
  }

  private findGitRepos(dir: string): Promise<string[]> {
    return new Promise((resolve) => {
      const args = [
        dir,
        '-maxdepth',
        '4',
        '-name',
        '.git',
        '-type',
        'd',
        ...EXCLUDE_PATTERNS.flatMap((p) => ['-not', '-path', `*/${p}/*`])
      ]

      execFile('find', args, { timeout: GIT_SCAN_TIMEOUT_MS }, (err, stdout) => {
        if (err) {
          resolve([])
          return
        }
        const dirs = stdout
          .trim()
          .split('\n')
          .filter((l) => l.length > 0)
        resolve(dirs)
      })
    })
  }

  async pollAllRepos(): Promise<void> {
    const repos = getGitRepos()

    for (const repo of repos) {
      if (repo.is_excluded) continue
      if (!existsSync(join(repo.path, '.git'))) continue

      try {
        await this.fetchCommits(repo.path, repo.name, repo.last_scanned)
        updateGitRepo(repo.id, { last_scanned: Date.now() })
      } catch (err) {
        console.error(`Error polling repo ${repo.path}:`, err)
      }
    }
  }

  private getGitUserEmail(repoPath: string): Promise<string> {
    return new Promise((resolve) => {
      execFile(
        'git',
        ['-C', repoPath, 'config', 'user.email'],
        { timeout: GIT_REPO_CHECK_TIMEOUT_MS },
        (err, stdout) => {
          resolve(err ? '' : stdout.trim())
        }
      )
    })
  }

  private async fetchCommits(
    repoPath: string,
    repoName: string,
    lastScanned: number
  ): Promise<void> {
    let authorEmail = getSetting('git.authorEmail')
    if (!authorEmail) {
      authorEmail = await this.getGitUserEmail(repoPath)
      if (authorEmail) {
        setSetting('git.authorEmail', authorEmail)
      }
    }

    return new Promise((resolve) => {
      // If never scanned, only fetch initial history window
      const since = lastScanned
        ? new Date(lastScanned).toISOString()
        : new Date(Date.now() - GIT_INITIAL_HISTORY_DAYS * MS_PER_DAY).toISOString()

      const args = [
        '-C',
        repoPath,
        'log',
        '--all',
        `--format=%H%x00%at%x00%an%x00%ae%x00%s`,
        '--shortstat',
        `--since=${since}`,
        ...(authorEmail ? [`--author=${authorEmail}`] : [])
      ]

      execFile(
        'git',
        args,
        { timeout: GIT_LOG_TIMEOUT_MS, maxBuffer: GIT_LOG_MAX_BUFFER },
        (err, stdout) => {
          if (err) {
            resolve()
            return
          }

          const lines = stdout.trim().split('\n')
          let currentCommit: {
            hash: string
            timestamp: number
            authorName: string
            authorEmail: string
            message: string
          } | null = null

          for (const line of lines) {
            if (!line.trim()) continue

            // Check if this is a commit line (contains null byte separators)
            if (line.includes('\0')) {
              // Save previous commit if any
              if (currentCommit) {
                insertGitCommit({
                  repo_path: repoPath,
                  repo_name: repoName,
                  commit_hash: currentCommit.hash,
                  timestamp: currentCommit.timestamp * 1000, // Convert to ms
                  author_name: currentCommit.authorName,
                  author_email: currentCommit.authorEmail,
                  message: currentCommit.message,
                  files_changed: 0,
                  insertions: 0,
                  deletions: 0
                })
              }

              const parts = line.split('\0')
              if (parts.length >= 5) {
                currentCommit = {
                  hash: parts[0],
                  timestamp: parseInt(parts[1], 10),
                  authorName: parts[2],
                  authorEmail: parts[3],
                  message: parts[4]
                }
              }
            } else if (currentCommit) {
              // Parse shortstat line
              const filesMatch = line.match(/(\d+) files? changed/)
              const insMatch = line.match(/(\d+) insertions?/)
              const delMatch = line.match(/(\d+) deletions?/)

              insertGitCommit({
                repo_path: repoPath,
                repo_name: repoName,
                commit_hash: currentCommit.hash,
                timestamp: currentCommit.timestamp * 1000,
                author_name: currentCommit.authorName,
                author_email: currentCommit.authorEmail,
                message: currentCommit.message,
                files_changed: filesMatch ? parseInt(filesMatch[1], 10) : 0,
                insertions: insMatch ? parseInt(insMatch[1], 10) : 0,
                deletions: delMatch ? parseInt(delMatch[1], 10) : 0
              })
              currentCommit = null
            }
          }

          // Don't forget the last commit if there was no shortstat after it
          if (currentCommit) {
            insertGitCommit({
              repo_path: repoPath,
              repo_name: repoName,
              commit_hash: currentCommit.hash,
              timestamp: currentCommit.timestamp * 1000,
              author_name: currentCommit.authorName,
              author_email: currentCommit.authorEmail,
              message: currentCommit.message,
              files_changed: 0,
              insertions: 0,
              deletions: 0
            })
          }

          resolve()
        }
      )
    })
  }
}
