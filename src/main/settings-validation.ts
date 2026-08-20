import { isAbsolute } from 'path'
import {
  MAX_CAPTURE_INTERVAL_MS,
  MAX_GIT_INTERVAL_MINUTES,
  MAX_JPEG_QUALITY,
  MAX_RETENTION_DAYS,
  MIN_CAPTURE_INTERVAL_MS,
  MIN_GIT_INTERVAL_MINUTES,
  MIN_JPEG_QUALITY,
  MIN_RETENTION_DAYS
} from '../shared/constants'
import type { ExcludedApp } from '../shared/types'

export const AI_PROVIDERS = ['openai', 'anthropic', 'google', 'ollama', 'lmstudio'] as const

const MAX_AI_API_KEY_LENGTH = 8192
const MAX_AI_MODEL_LENGTH = 200
const MAX_AI_BASE_URL_LENGTH = 2048
const MAX_AI_SUMMARY_PROMPT_LENGTH = 50_000
const MAX_GIT_AUTHOR_EMAIL_LENGTH = 320

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
const LOCAL_AI_PROVIDERS = new Set(['ollama', 'lmstudio'])
const CLOUD_AI_HOSTS = new Set(['api.openai.com'])

function isLoopbackHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (LOOPBACK_HOSTS.has(host) || LOOPBACK_HOSTS.has(hostname.toLowerCase())) return true
  const parts = host.split('.')
  if (parts.length === 4) {
    const octets = parts.map((part) => Number(part))
    if (octets[0] === 127 && octets.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
      return true
    }
  }
  return host === '::1'
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.')
  if (parts.length !== 4) return false
  const octets = parts.map((part) => Number(part))
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false
  const [a, b] = octets
  if (a === 10 || a === 127) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 169 && b === 254) return true
  return false
}

function isPrivateIpv6(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!host.includes(':')) return false
  if (host === '::1') return true
  if (host.startsWith('fe80:')) return true
  const first = host.split(':', 1)[0]
  return first.startsWith('fc') || first.startsWith('fd')
}

function isLocalAiHost(hostname: string): boolean {
  return isLoopbackHost(hostname) || isPrivateIpv4(hostname) || isPrivateIpv6(hostname)
}

/**
 * The base URL decides where the API key is sent. Any public https host would
 * let a compromised renderer exfiltrate the key, so cloud providers may only
 * target the official API (or a loopback proxy). Local providers may use
 * loopback or RFC1918/link-local addresses, where no real key is sent.
 */
export function isAllowedAiBaseUrl(value: string, provider?: string): boolean {
  if (!value.trim()) return true

  let url: URL
  try {
    url = new URL(value.trim())
  } catch {
    return false
  }

  if (url.username || url.password) return false
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false

  const host = url.hostname
  const isLocal = isLocalAiHost(host)
  const isOfficialCloud = url.protocol === 'https:' && CLOUD_AI_HOSTS.has(host.toLowerCase())

  if (provider && LOCAL_AI_PROVIDERS.has(provider)) {
    return isLocal
  }
  if (provider) {
    return isLoopbackHost(host) || isOfficialCloud
  }
  // IPC writes do not include the provider, so accept the union and let
  // createModel re-check with the active provider before dialling.
  return isLocal || isOfficialCloud
}

export function parseRetentionDays(raw: string | null, fallback: number): number {
  const parsed = raw ? Number.parseInt(raw, 10) : NaN
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(MAX_RETENTION_DAYS, Math.max(MIN_RETENTION_DAYS, parsed))
}

export function parseJpegQuality(raw: string | null): number | undefined {
  if (!raw) return undefined
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return undefined
  return Math.min(MAX_JPEG_QUALITY, Math.max(MIN_JPEG_QUALITY, parsed))
}

export function parseGitIntervalMinutes(raw: string | null, fallback: number): number {
  const parsed = raw ? Number.parseInt(raw, 10) : NaN
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(MAX_GIT_INTERVAL_MINUTES, Math.max(MIN_GIT_INTERVAL_MINUTES, parsed))
}

/**
 * Watch dirs are handed to `find`, so a stored value that is malformed or holds
 * a relative path has to fail closed rather than throw — a bad row would
 * otherwise take down every scan.
 */
export function parseWatchDirs(raw: string): string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    console.warn('Ignoring malformed git.watchDirs setting')
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.filter(
    (dir): dir is string =>
      typeof dir === 'string' && dir.length > 0 && !dir.includes('\0') && isAbsolute(dir)
  )
}

/**
 * A blank value means "unset" everywhere these settings are read (see
 * `parseIntervalMs`, `parseJpegQuality`, `parseCoveragePercent`,
 * `parseRetentionDays`, `parseGitIntervalMinutes`), including transiently
 * while a user is retyping a number field. Rejecting it here would make the
 * debounced write fail and roll the input back mid-edit, so it is passed
 * through unchanged rather than treated as invalid.
 */
function parseIntInRange(key: string, value: string, min: number, max: number): string {
  if (!value.trim()) return value
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) throw new Error(`Invalid value for ${key}: expected an integer`)
  return String(Math.min(max, Math.max(min, parsed)))
}

function requirePlainText(key: string, value: string, maxLength: number): string {
  if (value.includes('\0')) throw new Error(`Invalid value for ${key}: contains a NUL byte`)
  if (value.length > maxLength) {
    throw new Error(`Invalid value for ${key}: longer than ${maxLength} characters`)
  }
  return value
}

/**
 * Deliberately stricter than `parseExcludedApps`, which drops bad entries so a
 * corrupted row cannot break capture. A write is a chance to say no, so garbage
 * is rejected here instead of being silently coerced to "nothing excluded".
 */
function validateExcludedApps(value: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('Invalid value for capture.excludedApps: not valid JSON')
  }
  if (!Array.isArray(parsed)) {
    throw new Error('Invalid value for capture.excludedApps: expected an array')
  }

  const apps = parsed.map((entry): ExcludedApp => {
    if (!entry || typeof entry !== 'object') {
      throw new Error('Invalid value for capture.excludedApps: entries must be objects')
    }
    const { bundleId, name } = entry as { bundleId?: unknown; name?: unknown }
    if (typeof bundleId !== 'string' || bundleId.length === 0) {
      throw new Error('Invalid value for capture.excludedApps: bundleId must be a non-empty string')
    }
    if (name !== undefined && typeof name !== 'string') {
      throw new Error('Invalid value for capture.excludedApps: name must be a string')
    }
    return { bundleId, name: name && name.length > 0 ? name : bundleId }
  })

  return JSON.stringify(apps)
}

function validateWatchDirs(value: string): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('Invalid value for git.watchDirs: not valid JSON')
  }
  if (!Array.isArray(parsed)) {
    throw new Error('Invalid value for git.watchDirs: expected an array')
  }
  const dirs = parseWatchDirs(value)
  if (dirs.length !== parsed.length) {
    throw new Error('Invalid value for git.watchDirs: every entry must be an absolute path')
  }
  return JSON.stringify(dirs)
}

/**
 * Settings arrive over IPC as an untyped key/value pair, so the key itself is
 * attacker-controlled: without an allowlist a compromised renderer could write
 * any row the main process later trusts. Throws on an unknown key or an invalid
 * value; returns the sanitized string to persist.
 */
export function validateSetting(key: string, value: string): string {
  switch (key) {
    case 'capture.activeIntervalMs':
    case 'capture.idleIntervalMs':
      return parseIntInRange(key, value, MIN_CAPTURE_INTERVAL_MS, MAX_CAPTURE_INTERVAL_MS)
    case 'capture.jpegQuality':
      return parseIntInRange(key, value, MIN_JPEG_QUALITY, MAX_JPEG_QUALITY)
    case 'capture.exclusionCoverageThreshold':
      return parseIntInRange(key, value, 1, 100)
    case 'capture.excludedApps':
      return validateExcludedApps(value)

    case 'storage.retentionDays':
    case 'storage.ocrRetentionDays':
      return parseIntInRange(key, value, MIN_RETENTION_DAYS, MAX_RETENTION_DAYS)

    case 'git.watchDirs':
      return validateWatchDirs(value)
    case 'git.authorEmail':
      return requirePlainText(key, value, MAX_GIT_AUTHOR_EMAIL_LENGTH).trim()
    case 'git.scanIntervalMinutes':
    case 'git.pollIntervalMinutes':
      return parseIntInRange(key, value, MIN_GIT_INTERVAL_MINUTES, MAX_GIT_INTERVAL_MINUTES)

    case 'ai.provider':
      if (!(AI_PROVIDERS as readonly string[]).includes(value)) {
        throw new Error(`Invalid value for ai.provider: ${value}`)
      }
      return value
    case 'ai.apiKey':
      return requirePlainText(key, value, MAX_AI_API_KEY_LENGTH)
    case 'ai.model':
      return requirePlainText(key, value, MAX_AI_MODEL_LENGTH)
    case 'ai.baseUrl': {
      const trimmed = requirePlainText(key, value, MAX_AI_BASE_URL_LENGTH).trim()
      if (!isAllowedAiBaseUrl(trimmed)) {
        throw new Error(
          'Invalid value for ai.baseUrl: use the official API, localhost, or a private LAN address'
        )
      }
      return trimmed
    }
    case 'ai.summaryPrompt':
      return requirePlainText(key, value, MAX_AI_SUMMARY_PROMPT_LENGTH)

    default:
      throw new Error(`Unknown setting: ${key}`)
  }
}
