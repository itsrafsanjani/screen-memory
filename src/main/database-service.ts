import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'

interface ScreenshotRow {
  id: number
  timestamp: number
  display_id: string
  file_path: string
  width: number
  height: number
  file_size: number
  is_idle: number
}

export class DatabaseService {
  private db: Database.Database

  constructor() {
    const dbDir = join(app.getPath('userData'), 'data')
    mkdirSync(dbDir, { recursive: true })
    const dbPath = join(dbDir, 'screenmemory.db')

    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.init()
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS screenshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        display_id TEXT NOT NULL,
        file_path TEXT NOT NULL,
        width INTEGER,
        height INTEGER,
        file_size INTEGER,
        is_idle INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_screenshots_timestamp ON screenshots(timestamp);

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS git_commits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        repo_path TEXT NOT NULL,
        repo_name TEXT NOT NULL,
        commit_hash TEXT NOT NULL UNIQUE,
        timestamp INTEGER NOT NULL,
        author_name TEXT,
        author_email TEXT,
        message TEXT NOT NULL,
        files_changed INTEGER DEFAULT 0,
        insertions INTEGER DEFAULT 0,
        deletions INTEGER DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_git_commits_timestamp ON git_commits(timestamp);

      CREATE TABLE IF NOT EXISTS git_repos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        path TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        is_excluded INTEGER DEFAULT 0,
        last_scanned INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS ocr_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        screenshot_id INTEGER NOT NULL,
        text TEXT NOT NULL,
        confidence REAL DEFAULT 0,
        FOREIGN KEY (screenshot_id) REFERENCES screenshots(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_ocr_screenshot ON ocr_results(screenshot_id);
    `)
  }

  // --- Screenshots ---

  insertScreenshot(record: {
    timestamp: number
    display_id: string
    file_path: string
    width: number
    height: number
    file_size: number
    is_idle: boolean
  }): number {
    const stmt = this.db.prepare(`
      INSERT INTO screenshots (timestamp, display_id, file_path, width, height, file_size, is_idle)
      VALUES (@timestamp, @display_id, @file_path, @width, @height, @file_size, @is_idle)
    `)
    const result = stmt.run({
      ...record,
      is_idle: record.is_idle ? 1 : 0
    })
    return Number(result.lastInsertRowid)
  }

  getScreenshotsByDate(dateStr: string): ScreenshotRow[] {
    const [year, month, day] = dateStr.split('-').map(Number)
    const start = new Date(year, month - 1, day, 0, 0, 0, 0).getTime()
    const end = new Date(year, month - 1, day, 23, 59, 59, 999).getTime()
    return this.db
      .prepare(
        'SELECT * FROM screenshots WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC'
      )
      .all(start, end) as ScreenshotRow[]
  }

  getScreenshotsByTimeRange(start: number, end: number): ScreenshotRow[] {
    return this.db
      .prepare(
        'SELECT * FROM screenshots WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC'
      )
      .all(start, end) as ScreenshotRow[]
  }

  getAvailableDates(): string[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT date(timestamp / 1000, 'unixepoch', 'localtime') as day
         FROM screenshots ORDER BY day DESC`
      )
      .all() as { day: string }[]
    return rows.map((r) => r.day)
  }

  getDayBounds(dateStr: string): { first: number; last: number } | null {
    const [year, month, day] = dateStr.split('-').map(Number)
    const start = new Date(year, month - 1, day, 0, 0, 0, 0).getTime()
    const end = new Date(year, month - 1, day, 23, 59, 59, 999).getTime()
    const row = this.db
      .prepare(
        'SELECT MIN(timestamp) as first, MAX(timestamp) as last FROM screenshots WHERE timestamp >= ? AND timestamp <= ?'
      )
      .get(start, end) as { first: number | null; last: number | null }
    if (!row || row.first === null || row.last === null) return null
    return { first: row.first, last: row.last }
  }

  deleteOlderThan(timestampMs: number): number {
    const result = this.db.prepare('DELETE FROM screenshots WHERE timestamp < ?').run(timestampMs)
    return result.changes
  }

  getSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined
    return row?.value ?? null
  }

  setSetting(key: string, value: string): void {
    this.db
      .prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)')
      .run(key, value)
  }

  getAllSettings(): Record<string, string> {
    const rows = this.db.prepare('SELECT key, value FROM app_settings').all() as {
      key: string
      value: string
    }[]
    const result: Record<string, string> = {}
    for (const row of rows) {
      result[row.key] = row.value
    }
    return result
  }

  // --- Git Commits ---

  insertGitCommit(commit: {
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
    this.db
      .prepare(
        `INSERT OR IGNORE INTO git_commits
        (repo_path, repo_name, commit_hash, timestamp, author_name, author_email, message, files_changed, insertions, deletions)
        VALUES (@repo_path, @repo_name, @commit_hash, @timestamp, @author_name, @author_email, @message, @files_changed, @insertions, @deletions)`
      )
      .run(commit)
  }

  getCommitsByDateRange(
    start: number,
    end: number
  ): {
    id: number
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
  }[] {
    return this.db
      .prepare(
        'SELECT * FROM git_commits WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC'
      )
      .all(start, end) as {
      id: number
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
    }[]
  }

  // --- Git Repos ---

  insertGitRepo(repo: { path: string; name: string }): void {
    this.db.prepare('INSERT OR IGNORE INTO git_repos (path, name) VALUES (@path, @name)').run(repo)
  }

  getGitRepos(): {
    id: number
    path: string
    name: string
    is_excluded: number
    last_scanned: number
  }[] {
    return this.db.prepare('SELECT * FROM git_repos ORDER BY name ASC').all() as {
      id: number
      path: string
      name: string
      is_excluded: number
      last_scanned: number
    }[]
  }

  updateGitRepo(id: number, data: { is_excluded?: number; last_scanned?: number }): void {
    if (data.is_excluded !== undefined) {
      this.db.prepare('UPDATE git_repos SET is_excluded = ? WHERE id = ?').run(data.is_excluded, id)
    }
    if (data.last_scanned !== undefined) {
      this.db
        .prepare('UPDATE git_repos SET last_scanned = ? WHERE id = ?')
        .run(data.last_scanned, id)
    }
  }

  // --- OCR ---

  insertOcrResult(screenshotId: number, text: string, confidence: number): void {
    this.db
      .prepare('INSERT INTO ocr_results (screenshot_id, text, confidence) VALUES (?, ?, ?)')
      .run(screenshotId, text, confidence)
  }

  getOcrByScreenshotId(screenshotId: number): { text: string; confidence: number } | null {
    const row = this.db
      .prepare('SELECT text, confidence FROM ocr_results WHERE screenshot_id = ?')
      .get(screenshotId) as { text: string; confidence: number } | undefined
    return row ?? null
  }

  searchOcr(
    query: string,
    startMs?: number,
    endMs?: number
  ): {
    screenshot_id: number
    timestamp: number
    text_snippet: string
    display_id: string
    file_path: string
  }[] {
    let sql = `
      SELECT o.screenshot_id, s.timestamp, o.text as text_snippet, s.display_id, s.file_path
      FROM ocr_results o
      JOIN screenshots s ON o.screenshot_id = s.id
      WHERE o.text LIKE ?
    `
    const params: (string | number)[] = [`%${query}%`]

    if (startMs !== undefined) {
      sql += ' AND s.timestamp >= ?'
      params.push(startMs)
    }
    if (endMs !== undefined) {
      sql += ' AND s.timestamp <= ?'
      params.push(endMs)
    }

    sql += ' ORDER BY s.timestamp DESC LIMIT 100'

    return this.db.prepare(sql).all(...params) as {
      screenshot_id: number
      timestamp: number
      text_snippet: string
      display_id: string
      file_path: string
    }[]
  }

  close(): void {
    this.db.close()
  }
}
