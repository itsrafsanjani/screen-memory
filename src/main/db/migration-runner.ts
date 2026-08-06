import { app, type WebContents } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import Database from 'better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { initDb, getDbPath } from './client'
import { migrateLegacyDatabase, recoverInterruptedSwap } from './legacy-migrator'
import { IPC } from '../../shared/ipc-channels'

export type MigrationPhase =
  | 'idle'
  | 'preparing'
  | 'backup'
  | 'migrate-schema'
  | 'copy-table'
  | 'verify'
  | 'swap'
  | 'done'
  | 'error'

export interface MigrationProgress {
  phase: MigrationPhase
  table?: string
  rowsDone?: number
  rowsTotal?: number
  message?: string
}

const MIGRATIONS_FOLDER_DEV = join(__dirname, '../../src/main/db/migrations')
const MIGRATIONS_FOLDER_PROD = join(process.resourcesPath ?? '', 'db-migrations')

export function getMigrationsFolder(): string {
  return app.isPackaged ? MIGRATIONS_FOLDER_PROD : MIGRATIONS_FOLDER_DEV
}

function isLegacyDb(dbPath: string): boolean {
  if (!existsSync(dbPath)) return false
  const sqlite = new Database(dbPath, { readonly: true, fileMustExist: true })
  try {
    const drizzleMeta = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'")
      .get()
    if (drizzleMeta) return false
    const hasLegacy = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='screenshots'")
      .get()
    return !!hasLegacy
  } finally {
    sqlite.close()
  }
}

function emit(target: WebContents | null, progress: MigrationProgress): void {
  if (target && !target.isDestroyed()) {
    target.send(IPC.migration.progress, progress)
  }
}

export async function runMigrationsIfNeeded(target: WebContents | null = null): Promise<void> {
  const dbPath = getDbPath()

  // Has to run before anything reads the database path: a swap interrupted
  // mid-flight leaves no live database, which would otherwise be taken for a
  // fresh install and quietly replace the user's history with an empty one.
  recoverInterruptedSwap()

  const needsLegacyImport = isLegacyDb(dbPath)

  if (needsLegacyImport) {
    emit(target, { phase: 'preparing', message: 'Preparing one-time data migration…' })
    await migrateLegacyDatabase((progress) => emit(target, progress), getMigrationsFolder())
  }

  // Initialize Drizzle on the (possibly freshly-swapped) DB and ensure all migrations are applied.
  const db = initDb()
  migrate(db, { migrationsFolder: getMigrationsFolder() })

  emit(target, { phase: 'done' })
}
