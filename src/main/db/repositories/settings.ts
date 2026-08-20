import { eq } from 'drizzle-orm'
import { decryptSecret, encryptSecret, isEncryptedSecret } from '../../secret-store'
import { getDb } from '../client'
import { appSettings } from '../schema'

const API_KEY = 'ai.apiKey'

function readRaw(key: string): string | null {
  const db = getDb()
  const row = db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .get()
  return row?.value ?? null
}

export function getSetting(key: string): string | null {
  const value = readRaw(key)
  if (key === API_KEY && value) return decryptSecret(value)
  return value
}

export function setSetting(key: string, value: string): void {
  const db = getDb()
  const stored = key === API_KEY && value ? encryptSecret(value) : value
  db.insert(appSettings)
    .values({ key, value: stored })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: stored } })
    .run()
}

/**
 * Settings safe to hand to the renderer: the API key itself is replaced by a
 * `ai.hasApiKey` flag so the secret never crosses the IPC boundary. Presence is
 * derived from a successful decrypt so a keychain-denied ciphertext is not
 * shown as "Key saved".
 */
export function getAllSettingsForRenderer(): Record<string, string> {
  const db = getDb()
  const rows = db.select().from(appSettings).all()
  const out: Record<string, string> = {}
  let hasApiKey = false
  for (const row of rows) {
    if (row.key === API_KEY) {
      hasApiKey = decryptSecret(row.value).length > 0
      continue
    }
    out[row.key] = row.value
  }
  out['ai.hasApiKey'] = hasApiKey ? '1' : '0'
  return out
}

/**
 * Re-stores a legacy plaintext API key so it becomes encrypted at rest. Failures
 * are logged rather than thrown: a key that cannot be encrypted is still usable,
 * and startup must not depend on the keychain being reachable.
 */
export function migrateApiKeyToSafeStorage(): void {
  const raw = readRaw(API_KEY)
  if (!raw || isEncryptedSecret(raw)) return

  try {
    setSetting(API_KEY, raw)
  } catch (error) {
    console.error('Failed to encrypt stored API key:', error)
  }
}
