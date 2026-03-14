import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { basename, join } from 'path'
import { homedir } from 'os'
import { DatabaseService } from './database-service'

const DEFAULT_WATCH_DIRS = ['Projects', 'Code', 'Developer', 'Desktop', 'Documents'].map((d) =>
  join(homedir(), d)
)
const EXCLUDE_PATTERNS = ['node_modules', '.Trash', 'Library', '.cache', '.npm']

export class GitService {
  private db: DatabaseService
  private scanTimer: ReturnType<typeof setInterval> | null = null
  private pollTimer: ReturnType<typeof setInterval> | null = null

  constructor(db: DatabaseService) {
    this.db = db
  }

  start(scanIntervalMinutes = 60, pollIntervalMinutes = 5): void {
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
    setTimeout(() => this.pollAllRepos().catch(console.error), 5000)
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
    const watchDirsStr = this.db.getSetting('git.watchDirs')
    const watchDirs: string[] = watchDirsStr ? JSON.parse(watchDirsStr) : DEFAULT_WATCH_DIRS

    for (const dir of watchDirs) {
      if (!existsSync(dir)) continue

      try {
        const gitDirs = await this.findGitRepos(dir)
        for (const gitDir of gitDirs) {
          const repoPath = gitDir.replace(/\/\.git$/, '')
          const repoName = basename(repoPath)
          this.db.insertGitRepo({ path: repoPath, name: repoName })
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

      execFile('find', args, { timeout: 30000 }, (err, stdout) => {
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
    const repos = this.db.getGitRepos()

    for (const repo of repos) {
      if (repo.is_excluded) continue
      if (!existsSync(join(repo.path, '.git'))) continue

      try {
        await this.fetchCommits(repo.path, repo.name, repo.last_scanned)
        this.db.updateGitRepo(repo.id, { last_scanned: Date.now() })
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
        { timeout: 5000 },
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
    let authorEmail = this.db.getSetting('git.authorEmail')
    if (!authorEmail) {
      authorEmail = await this.getGitUserEmail(repoPath)
      if (authorEmail) {
        this.db.setSetting('git.authorEmail', authorEmail)
      }
    }

    return new Promise((resolve) => {
      // If never scanned, only fetch last 30 days
      const since = lastScanned
        ? new Date(lastScanned).toISOString()
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

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

      execFile('git', args, { timeout: 30000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
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
              this.db.insertGitCommit({
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

            this.db.insertGitCommit({
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
          this.db.insertGitCommit({
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
      })
    })
  }
}
