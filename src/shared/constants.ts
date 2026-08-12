/**
 * Centralized defaults used across the main process. Renderer values that
 * mirror these live behind settings and should fall back to these constants.
 */

// Capture cadence (milliseconds)
export const DEFAULT_ACTIVE_INTERVAL_MS = 5_000
export const DEFAULT_IDLE_INTERVAL_MS = 30_000
export const DEFAULT_JPEG_QUALITY = 65
/**
 * Floor for either capture interval. A screenshot costs a full-screen grab, a
 * JPEG encode, a disk write and an OCR job, so anything near zero is a runaway
 * rather than a fast setting.
 */
export const MIN_CAPTURE_INTERVAL_MS = 250

// Idle detection (seconds of system inactivity before treating user as idle)
export const IDLE_THRESHOLD_SECONDS = 120

// Git polling (minutes)
export const DEFAULT_GIT_SCAN_INTERVAL_MINUTES = 60
export const DEFAULT_GIT_POLL_INTERVAL_MINUTES = 5
export const GIT_POLL_STARTUP_DELAY_MS = 5_000
export const GIT_SCAN_TIMEOUT_MS = 30_000
export const GIT_REPO_CHECK_TIMEOUT_MS = 5_000
export const GIT_LOG_TIMEOUT_MS = 30_000
export const GIT_LOG_MAX_BUFFER = 10 * 1024 * 1024
export const GIT_INITIAL_HISTORY_DAYS = 30

// Native app-state helper
export const APP_STATE_REQUEST_TIMEOUT_MS = 2_000
// The capture tick and the usage tick both ask for state; memoizing for a
// second lets them share a single round-trip to the helper.
export const APP_STATE_CACHE_MS = 1_000
export const APP_STATE_RESPAWN_BASE_DELAY_MS = 1_000
export const APP_STATE_RESPAWN_MAX_DELAY_MS = 30_000

// App exclusion: an excluded app is skipped on a display when it is the
// frontmost window there and covers at least this share of it (percent).
export const DEFAULT_EXCLUSION_COVERAGE_PERCENT = 80

// App usage tracking
export const USAGE_POLL_INTERVAL_MS = 2_000

/**
 * How often the Usage view re-reads today from the database. The open segment
 * is grown every `USAGE_POLL_INTERVAL_MS`, so the numbers on screen go stale
 * immediately without this — the window is hidden and shown rather than
 * remounted, so nothing else would ever refetch them.
 */
export const USAGE_REFRESH_INTERVAL_MS = 15_000

// Retention (days)
export const DEFAULT_SCREENSHOT_RETENTION_DAYS = 7
export const DEFAULT_OCR_RETENTION_DAYS = 90
export const DEFAULT_USAGE_RETENTION_DAYS = 365

// Time helpers
export const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Longest a single usage segment may run before it is rolled over into a new
 * one. Day queries bound their index scan by this, so a segment that outran it
 * would disappear from every day it covers but the first.
 */
export const MAX_SEGMENT_SPAN_MS = MS_PER_DAY
