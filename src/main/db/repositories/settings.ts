import { eq } from 'drizzle-orm'
import { getDb } from '../client'
import { appSettings } from '../schema'

export function getSetting(key: string): string | null {
  const db = getDb()
  const row = db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .get()
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  const db = getDb()
  db.insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value } })
    .run()
}

export function getAllSettings(): Record<string, string> {
  const db = getDb()
  const rows = db.select().from(appSettings).all()
  const out: Record<string, string> = {}
  for (const row of rows) {
    out[row.key] = row.value
  }
  return out
}
