import { and, asc, eq, gte, lte } from 'drizzle-orm'
import { getDb } from '../client'
import { gitCommits, gitRepos } from '../schema'

export interface GitCommitRow {
  id: number
  repo_path: string
  repo_name: string
  commit_hash: string
  timestamp: number
  author_name: string | null
  author_email: string | null
  message: string
  files_changed: number
  insertions: number
  deletions: number
}

export interface GitRepoRow {
  id: number
  path: string
  name: string
  is_excluded: number
  last_scanned: number
}

export function insertGitCommit(commit: {
  repo_path: string
  repo_name: string
  commit_hash: string
  timestamp: number
  author_name: string
  author_email: string
  message: string
  files_changed: number
  insertions: number
  deletions: number
}): void {
  const db = getDb()
  db.insert(gitCommits)
    .values({
      repoPath: commit.repo_path,
      repoName: commit.repo_name,
      commitHash: commit.commit_hash,
      timestamp: commit.timestamp,
      authorName: commit.author_name,
      authorEmail: commit.author_email,
      message: commit.message,
      filesChanged: commit.files_changed,
      insertions: commit.insertions,
      deletions: commit.deletions
    })
    .onConflictDoNothing({ target: gitCommits.commitHash })
    .run()
}

export function getCommitsByDateRange(start: number, end: number): GitCommitRow[] {
  const db = getDb()
  const rows = db
    .select()
    .from(gitCommits)
    .where(and(gte(gitCommits.timestamp, start), lte(gitCommits.timestamp, end)))
    .orderBy(asc(gitCommits.timestamp))
    .all()
  return rows.map((r) => ({
    id: r.id,
    repo_path: r.repoPath,
    repo_name: r.repoName,
    commit_hash: r.commitHash,
    timestamp: r.timestamp,
    author_name: r.authorName,
    author_email: r.authorEmail,
    message: r.message,
    files_changed: r.filesChanged,
    insertions: r.insertions,
    deletions: r.deletions
  }))
}

export function insertGitRepo(repo: { path: string; name: string }): void {
  const db = getDb()
  db.insert(gitRepos)
    .values({ path: repo.path, name: repo.name })
    .onConflictDoNothing({ target: gitRepos.path })
    .run()
}

export function getGitRepos(): GitRepoRow[] {
  const db = getDb()
  const rows = db.select().from(gitRepos).orderBy(asc(gitRepos.name)).all()
  return rows.map((r) => ({
    id: r.id,
    path: r.path,
    name: r.name,
    is_excluded: r.isExcluded,
    last_scanned: r.lastScanned
  }))
}

export function updateGitRepo(
  id: number,
  data: { is_excluded?: number; last_scanned?: number }
): void {
  const db = getDb()
  const patch: { isExcluded?: number; lastScanned?: number } = {}
  if (data.is_excluded !== undefined) patch.isExcluded = data.is_excluded
  if (data.last_scanned !== undefined) patch.lastScanned = data.last_scanned
  if (Object.keys(patch).length === 0) return
  db.update(gitRepos).set(patch).where(eq(gitRepos.id, id)).run()
}
