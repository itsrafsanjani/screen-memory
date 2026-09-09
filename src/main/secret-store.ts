import { safeStorage } from 'electron'

const PREFIX = 'enc:v1:'

export function isEncryptedSecret(stored: string): boolean {
  return stored.startsWith(PREFIX)
}

export function encryptSecret(plaintext: string): string {
  if (!plaintext) return ''
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(
      'The OS keychain is unavailable, so the API key cannot be stored securely. Unlock your keychain and try again.'
    )
  }
  return PREFIX + safeStorage.encryptString(plaintext).toString('base64')
}

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
