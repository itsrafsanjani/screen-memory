import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync } from 'fs'
import * as schema from './schema'

export type DbSchema = typeof schema
export type Db = BetterSQLite3Database<DbSchema>

export function getDbDir(): string {
  return join(app.getPath('userData'), 'data')
}

export function getDbPath(): string {
  return join(getDbDir(), 'screenmemory.db')
}

export function getBackupPath(unixMs: number = Date.now()): string {
  return join(getDbDir(), `screenmemory.legacy-${unixMs}.db.bak`)
}

export function getStagingPath(): string {
  return join(getDbDir(), 'screenmemory.new.db')
}

/**
 * Where the original database is parked during the swap. Its presence with no
 * live database is what tells the next launch that a swap was interrupted.
 */
export function getPreSwapPath(): string {
  return join(getDbDir(), 'screenmemory.pre-migration.db')
}

let dbInstance: Db | null = null
let sqliteInstance: Database.Database | null = null

export function openDb(dbPath: string): { db: Db; sqlite: Database.Database } {
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('synchronous = NORMAL')
  const db = drizzle(sqlite, { schema })
  return { db, sqlite }
}

export function initDb(): Db {
  if (dbInstance) return dbInstance
  mkdirSync(getDbDir(), { recursive: true })
  const { db, sqlite } = openDb(getDbPath())
  dbInstance = db
  sqliteInstance = sqlite
  return db
}

export function getDb(): Db {
  if (!dbInstance) throw new Error('Database not initialized. Call initDb() first.')
  return dbInstance
}

export function getRawSqlite(): Database.Database {
  if (!sqliteInstance) throw new Error('Database not initialized. Call initDb() first.')
  return sqliteInstance
}

export function closeDb(): void {
  sqliteInstance?.close()
  sqliteInstance = null
  dbInstance = null
}
