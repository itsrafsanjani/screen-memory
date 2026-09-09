/* oxlint-disable anti-slop/no-runtime-typeof, anti-slop/require-safety-comment-for-type-assertion -- boundary validation of untyped settings JSON; the anti-slop set goes away with the eslint migration */
import type { CaptureService } from './capture-service'
import { getSetting } from './db/repositories/settings'
import {
  DEFAULT_EXCLUSION_COVERAGE_PERCENT,
  MAX_CAPTURE_INTERVAL_MS,
  MAX_JPEG_QUALITY,
  MIN_CAPTURE_INTERVAL_MS,
  MIN_JPEG_QUALITY
} from '../shared/constants'
import type { ExcludedApp } from '../shared/types'

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

export function parseIntervalMs(raw: string | null): number | undefined {
  if (!raw) return undefined
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return undefined
  return Math.min(MAX_CAPTURE_INTERVAL_MS, Math.max(MIN_CAPTURE_INTERVAL_MS, parsed))
}

export function parseJpegQuality(raw: string | null): number | undefined {
  if (!raw) return undefined
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed)) return undefined
  return Math.min(MAX_JPEG_QUALITY, Math.max(MIN_JPEG_QUALITY, parsed))
}

export function applyExclusionSettings(capture: CaptureService): void {
  capture.setExclusion(
    parseExcludedApps(getSetting('capture.excludedApps')),
    parseCoveragePercent(getSetting('capture.exclusionCoverageThreshold'))
  )
}
