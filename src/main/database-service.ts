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
    `)
  }

  insertScreenshot(record: {
    timestamp: number
    display_id: string
    file_path: string
    width: number
    height: number
    file_size: number
    is_idle: boolean
  }): void {
    const stmt = this.db.prepare(`
      INSERT INTO screenshots (timestamp, display_id, file_path, width, height, file_size, is_idle)
      VALUES (@timestamp, @display_id, @file_path, @width, @height, @file_size, @is_idle)
    `)
    stmt.run({
      ...record,
      is_idle: record.is_idle ? 1 : 0
    })
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

  close(): void {
    this.db.close()
  }
}
