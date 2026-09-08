import { safeStorage } from 'electron'

/**
 * Marks a stored value as ciphertext. Versioned so a future format change can be
 * told apart from both `enc:v1:` blobs and pre-encryption plaintext.
 */
const PREFIX = 'enc:v1:'

export function isEncryptedSecret(stored: string): boolean {
  return stored.startsWith(PREFIX)
}

/**
 * Encrypts a secret for storage in the settings table. When the OS keychain is
 * unavailable (headless Linux, locked keyring) the write is refused instead of
 * falling back to plaintext — callers propagate this as a normal validation
 * failure rather than silently persisting an unencrypted key.
 */
export function encryptSecret(plaintext: string): string {
  if (!plaintext) return ''
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      'The OS keychain is unavailable, so the API key cannot be stored securely. Unlock your keychain and try again.'
    )
  }
  return PREFIX + safeStorage.encryptString(plaintext).toString('base64')
}

/** Inverse of {@link encryptSecret}. Unprefixed values are legacy plaintext. */
let loggedDecryptFailure = false

export function decryptSecret(stored: string): string {
  if (!stored) return ''
  if (!isEncryptedSecret(stored)) return stored
  try {
    return safeStorage.decryptString(Buffer.from(stored.slice(PREFIX.length), 'base64'))
  } catch (error) {
    if (!loggedDecryptFailure) {
      loggedDecryptFailure = true
      console.error(
        'Failed to decrypt stored API key; it will need to be re-entered in Settings.',
        error
      )
    }
    return ''
  }
}
