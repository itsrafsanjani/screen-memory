import Database from 'better-sqlite3'
import { copyFileSync, existsSync, renameSync, unlinkSync } from 'fs'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { getBackupPath, getDbPath, getStagingPath } from './client'
import type { MigrationProgress } from './migration-runner'
import * as schema from './schema'

type Emit = (progress: MigrationProgress) => void

const COPY_BATCH = 5000

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
  const backupPath = getBackupPath()

  if (existsSync(stagingPath)) unlinkSync(stagingPath)

  // 1. Backup
  emit({ phase: 'backup', message: 'Backing up your existing database…' })
  copyFileSync(livePath, backupPath)

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
    if (existsSync(stagingPath)) unlinkSync(stagingPath)
    throw err
  }

  legacySqlite.close()
  freshSqlite.close()

  // 4. Atomic swap: replace live DB with staging
  emit({ phase: 'swap', message: 'Finalizing migration…' })
  // The original DB is still preserved at backupPath
  unlinkSync(livePath)
  renameSync(stagingPath, livePath)
}
