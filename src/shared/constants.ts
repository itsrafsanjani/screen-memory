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
/**
 * Ceiling for either capture interval. `setTimeout` treats delays above
 * 2³¹−1 as 1 ms, so an unbounded integer becomes a tight loop that fills
 * the disk. An hour is far beyond any useful cadence.
 */
export const MAX_CAPTURE_INTERVAL_MS = 3_600_000

export const MIN_JPEG_QUALITY = 1
export const MAX_JPEG_QUALITY = 100

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
export const MIN_GIT_INTERVAL_MINUTES = 1
/** One week. A longer interval is indistinguishable from disabling the timer. */
export const MAX_GIT_INTERVAL_MINUTES = 10_080

// Retention (days)
export const DEFAULT_SCREENSHOT_RETENTION_DAYS = 30
export const DEFAULT_OCR_RETENTION_DAYS = 90
/**
 * Retention is turned into a cutoff timestamp and everything older is deleted,
 * so a zero or negative value would wipe the whole archive on the next sweep.
 */
export const MIN_RETENTION_DAYS = 1
export const MAX_RETENTION_DAYS = 3650

// Time helpers
export const MS_PER_DAY = 24 * 60 * 60 * 1000
