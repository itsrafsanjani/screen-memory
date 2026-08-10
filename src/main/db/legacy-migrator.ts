import Database from 'better-sqlite3'
import { copyFileSync, existsSync, renameSync, unlinkSync } from 'fs'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { getBackupPath, getDbPath, getPreSwapPath, getStagingPath } from './client'
import type { MigrationProgress } from './migration-runner'
import * as schema from './schema'

type Emit = (progress: MigrationProgress) => void

const COPY_BATCH = 5000

/**
 * SQLite spreads a WAL-mode database across three files. Every operation here
 * has to treat them as one unit: copying or deleting the main file alone either
 * loses the committed pages still sitting in the log, or strands a log that
 * SQLite will later replay into an unrelated database and corrupt it.
 */
const SIDECAR_SUFFIXES = ['-wal', '-shm']

function removeDbFiles(path: string): void {
  for (const candidate of [path, ...SIDECAR_SUFFIXES.map((suffix) => path + suffix)]) {
    if (existsSync(candidate)) unlinkSync(candidate)
  }
}

/**
 * Folds the write-ahead log back into the main database file so that a plain
 * file copy of it is complete. A no-op on databases that aren't in WAL mode.
 */
function checkpoint(path: string): void {
  const sqlite = new Database(path)
  try {
    sqlite.pragma('wal_checkpoint(TRUNCATE)')
  } finally {
    sqlite.close()
  }
}

function countRows(db: Database.Database, table: string): number {
  return (db.prepare(`SELECT COUNT(*) as c FROM ${table}`).get() as { c: number }).c
}

/**
 * Guards against a lossy backup. Comparing the staging database against the
 * backup can't catch this on its own: if the backup silently dropped rows, both
 * sides are missing them and the counts agree.
 */
function verifyBackup(livePath: string, backupPath: string): void {
  const live = new Database(livePath, { readonly: true, fileMustExist: true })
  const backup = new Database(backupPath, { readonly: true, fileMustExist: true })
  try {
    for (const table of TABLES) {
      if (!tableExists(live, table.name)) continue
      const liveCount = countRows(live, table.name)
      const backupCount = tableExists(backup, table.name) ? countRows(backup, table.name) : -1
      if (liveCount !== backupCount) {
        throw new Error(
          `Backup verification failed for ${table.name}: original=${liveCount}, backup=${backupCount}`
        )
      }
    }
  } finally {
    live.close()
    backup.close()
  }
}

/**
 * Finishes or unwinds a swap that was cut short by a crash or a force quit.
 * Without this, a missing live database reads as a fresh install on the next
 * launch and the user silently starts over with an empty history.
 */
export function recoverInterruptedSwap(): void {
  const livePath = getDbPath()
  const preSwapPath = getPreSwapPath()
  const stagingPath = getStagingPath()

  if (existsSync(livePath)) {
    // The swap got as far as putting the new database in place, so the parked
    // original is just leftover; the .bak copy remains either way.
    if (existsSync(preSwapPath)) removeDbFiles(preSwapPath)
    return
  }

  if (existsSync(preSwapPath)) {
    console.warn('Recovering interrupted migration: restoring the original database')
    renameSync(preSwapPath, livePath)
    for (const suffix of SIDECAR_SUFFIXES) {
      const sidecar = preSwapPath + suffix
      if (existsSync(sidecar)) renameSync(sidecar, livePath + suffix)
    }
    return
  }

  // Nothing parked, but a fully migrated staging database is there: the crash
  // landed in the window the old unlink-then-rename swap left open.
  if (existsSync(stagingPath)) {
    console.warn('Recovering interrupted migration: promoting the migrated database')
    renameSync(stagingPath, livePath)
    for (const suffix of SIDECAR_SUFFIXES) {
      const sidecar = stagingPath + suffix
      if (existsSync(sidecar)) renameSync(sidecar, livePath + suffix)
    }
  }
}

interface TableSpec {
  name: string
  legacyColumns: string[]
  drizzleColumns: string[]
  transformIsIdle?: boolean
}

const TABLES: TableSpec[] = [
  {
    name: 'screenshots',
    legacyColumns: [
      'id',
      'timestamp',
      'display_id',
      'file_path',
      'width',
      'height',
      'file_size',
      'is_idle'
    ],
    drizzleColumns: [
      'id',
      'timestamp',
      'display_id',
      'file_path',
      'width',
      'height',
      'file_size',
      'is_idle'
    ]
  },
  {
    name: 'app_settings',
    legacyColumns: ['key', 'value'],
    drizzleColumns: ['key', 'value']
  },
  {
    name: 'git_commits',
    legacyColumns: [
      'id',
      'repo_path',
      'repo_name',
      'commit_hash',
      'timestamp',
      'author_name',
      'author_email',
      'message',
      'files_changed',
      'insertions',
      'deletions'
    ],
    drizzleColumns: [
      'id',
      'repo_path',
      'repo_name',
      'commit_hash',
      'timestamp',
      'author_name',
      'author_email',
      'message',
      'files_changed',
      'insertions',
      'deletions'
    ]
  },
  {
    name: 'git_repos',
    legacyColumns: ['id', 'path', 'name', 'is_excluded', 'last_scanned'],
    drizzleColumns: ['id', 'path', 'name', 'is_excluded', 'last_scanned']
  },
  {
    name: 'ocr_results',
    legacyColumns: [
      'id',
      'screenshot_id',
      'timestamp',
      'display_id',
      'is_idle',
      'text',
      'confidence'
    ],
    drizzleColumns: [
      'id',
      'screenshot_id',
      'timestamp',
      'display_id',
      'is_idle',
      'text',
      'confidence'
    ]
  }
]

function ensureOcrTimestampColumns(legacy: Database.Database): void {
  // Old DBs had ocr_results without timestamp/display_id/is_idle columns.
  // We rebuild that table inside the legacy DB BEFORE copy so SELECT works uniformly.
  const cols = legacy.prepare('PRAGMA table_info(ocr_results)').all() as { name: string }[]
  if (cols.some((c) => c.name === 'timestamp')) return

  legacy.transaction(() => {
    legacy.exec(`
      CREATE TABLE ocr_results_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        screenshot_id INTEGER,
        timestamp INTEGER NOT NULL,
        display_id TEXT NOT NULL,
        is_idle INTEGER DEFAULT 0,
        text TEXT NOT NULL,
        confidence REAL DEFAULT 0
      );
      INSERT INTO ocr_results_new (id, screenshot_id, timestamp, display_id, is_idle, text, confidence)
      SELECT o.id, o.screenshot_id, s.timestamp, s.display_id, s.is_idle, o.text, o.confidence
      FROM ocr_results o
      INNER JOIN screenshots s ON s.id = o.screenshot_id;
      DROP TABLE ocr_results;
      ALTER TABLE ocr_results_new RENAME TO ocr_results;
    `)
  })()
}

function tableExists(db: Database.Database, name: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name)
  return !!row
}

function copyTable(
  legacy: Database.Database,
  fresh: Database.Database,
  table: TableSpec,
  emit: Emit
): void {
  if (!tableExists(legacy, table.name)) return

  const countRow = legacy.prepare(`SELECT COUNT(*) as c FROM ${table.name}`).get() as {
    c: number
  }
  const total = countRow.c
  emit({ phase: 'copy-table', table: table.name, rowsDone: 0, rowsTotal: total })
  if (total === 0) return

  const selectCols = table.legacyColumns.join(', ')
  const insertCols = table.drizzleColumns.join(', ')
  const placeholders = table.drizzleColumns.map(() => '?').join(', ')
  const insertStmt = fresh.prepare(
    `INSERT INTO ${table.name} (${insertCols}) VALUES (${placeholders})`
  )

  let offset = 0
  while (offset < total) {
    const rows = legacy
      .prepare(
        `SELECT ${selectCols} FROM ${table.name} ORDER BY rowid ASC LIMIT ${COPY_BATCH} OFFSET ${offset}`
      )
      .all() as Record<string, unknown>[]

    if (rows.length === 0) break

    fresh.transaction(() => {
      for (const row of rows) {
        const values = table.legacyColumns.map((c) => row[c] ?? null)
        insertStmt.run(...values)
      }
    })()

    offset += rows.length
    emit({ phase: 'copy-table', table: table.name, rowsDone: offset, rowsTotal: total })
  }
}

function verifyCounts(legacy: Database.Database, fresh: Database.Database): void {
  for (const table of TABLES) {
    if (!tableExists(legacy, table.name)) continue
    const legacyCount = (
      legacy.prepare(`SELECT COUNT(*) as c FROM ${table.name}`).get() as { c: number }
    ).c
    const freshCount = (
      fresh.prepare(`SELECT COUNT(*) as c FROM ${table.name}`).get() as { c: number }
    ).c
    if (legacyCount !== freshCount) {
      throw new Error(
        `Migration verification failed for ${table.name}: legacy=${legacyCount}, fresh=${freshCount}`
      )
    }
  }
}

export async function migrateLegacyDatabase(emit: Emit, migrationsFolder: string): Promise<void> {
  const livePath = getDbPath()
  const stagingPath = getStagingPath()
  const preSwapPath = getPreSwapPath()
  const backupPath = getBackupPath()

  removeDbFiles(stagingPath)

  // 1. Backup. The checkpoint first is what makes the copy trustworthy: a
  // database that was force-quit still has committed rows in its -wal, and
  // copying the main file alone would leave them behind.
  emit({ phase: 'backup', message: 'Backing up your existing database…' })
  checkpoint(livePath)
  copyFileSync(livePath, backupPath)
  verifyBackup(livePath, backupPath)

  // 2. Apply Drizzle migrations against a fresh staging DB
  emit({ phase: 'migrate-schema', message: 'Preparing new database…' })
  const freshSqlite = new Database(stagingPath)
  freshSqlite.pragma('journal_mode = WAL')
  freshSqlite.pragma('synchronous = NORMAL')
  const freshDrizzle = drizzle(freshSqlite, { schema })
  migrate(freshDrizzle, { migrationsFolder })

  // 3. Open legacy read-write so we can patch the OCR schema if needed
  const legacySqlite = new Database(backupPath)
  legacySqlite.pragma('journal_mode = WAL')

  try {
    ensureOcrTimestampColumns(legacySqlite)
    for (const table of TABLES) {
      copyTable(legacySqlite, freshSqlite, table, emit)
    }
    emit({ phase: 'verify', message: 'Verifying row counts…' })
    verifyCounts(legacySqlite, freshSqlite)
  } catch (err) {
    legacySqlite.close()
    freshSqlite.close()
    removeDbFiles(stagingPath)
    throw err
  }

  legacySqlite.close()
  // Leaves the staging database in a single self-contained file, so the rename
  // below moves all of it.
  freshSqlite.pragma('wal_checkpoint(TRUNCATE)')
  freshSqlite.close()

  // 4. Swap. Every step is a rename, so there is no instant where neither the
  // original nor the migrated database is in place — a crash anywhere in here
  // is recoverable by recoverInterruptedSwap() on the next launch.
  emit({ phase: 'swap', message: 'Finalizing migration…' })
  renameSync(livePath, preSwapPath)
  // The legacy log belongs to the database that just moved aside. Left here, it
  // would be replayed into the migrated database and corrupt it.
  for (const suffix of SIDECAR_SUFFIXES) {
    const sidecar = livePath + suffix
    if (existsSync(sidecar)) renameSync(sidecar, preSwapPath + suffix)
  }
  renameSync(stagingPath, livePath)
  removeDbFiles(stagingPath)
  // Only now is the original redundant, and the .bak copy still preserves it.
  removeDbFiles(preSwapPath)
}
