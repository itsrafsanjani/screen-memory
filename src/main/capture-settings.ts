import type { CaptureService } from './capture-service'
import { getSetting } from './db/repositories/settings'
import { DEFAULT_EXCLUSION_COVERAGE_PERCENT, MIN_CAPTURE_INTERVAL_MS } from '../shared/constants'
import type { ExcludedApp } from '../shared/types'

/**
 * `capture.excludedApps` is stored as a JSON array of `{ bundleId, name }` so
 * it fits the string-valued settings table. Anything malformed is treated as
 * "nothing excluded" rather than failing capture.
 */
export function parseExcludedApps(raw: string | null): ExcludedApp[] {
  if (!raw) return []
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((entry) => {
      if (!entry || typeof entry !== 'object') return []
      const { bundleId, name } = entry as { bundleId?: unknown; name?: unknown }
      if (typeof bundleId !== 'string' || bundleId.length === 0) return []
      return [{ bundleId, name: typeof name === 'string' && name ? name : bundleId }]
    })
  } catch {
    console.warn('Ignoring malformed capture.excludedApps setting')
    return []
  }
}

export function parseCoveragePercent(raw: string | null): number {
  const parsed = raw ? Number.parseInt(raw, 10) : NaN
  if (!Number.isFinite(parsed)) return DEFAULT_EXCLUSION_COVERAGE_PERCENT
  return Math.min(100, Math.max(1, parsed))
}

/**
 * An interval goes straight to `setTimeout`, which clamps anything ≤ 0 to a
 * millisecond, so a mistyped `5` or `-1000` turns capture into a tight loop
 * that fills the disk and pegs a core. Undefined leaves the running value
 * alone, which is what a cleared field should do.
 */
export function parseIntervalMs(raw: string | null): number | undefined {
  if (!raw) return undefined
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return undefined
  return Math.max(MIN_CAPTURE_INTERVAL_MS, parsed)
}

/** Reads every `capture.*` setting and pushes it into the running service. */
export function applyCaptureSettings(capture: CaptureService): void {
  const activeMs = getSetting('capture.activeIntervalMs')
  const idleMs = getSetting('capture.idleIntervalMs')
  const quality = getSetting('capture.jpegQuality')
  capture.updateIntervals(
    parseIntervalMs(activeMs),
    parseIntervalMs(idleMs),
    quality ? parseInt(quality, 10) : undefined
  )
  capture.setExclusion(
    parseExcludedApps(getSetting('capture.excludedApps')),
    parseCoveragePercent(getSetting('capture.exclusionCoverageThreshold'))
  )
}
