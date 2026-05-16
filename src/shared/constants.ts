/**
 * Centralized defaults used across the main process. Renderer values that
 * mirror these live behind settings and should fall back to these constants.
 */

// Capture cadence (milliseconds)
export const DEFAULT_ACTIVE_INTERVAL_MS = 5_000
export const DEFAULT_IDLE_INTERVAL_MS = 30_000
export const DEFAULT_JPEG_QUALITY = 65

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

// Retention (days)
export const DEFAULT_SCREENSHOT_RETENTION_DAYS = 7
export const DEFAULT_OCR_RETENTION_DAYS = 90

// Time helpers
export const MS_PER_DAY = 24 * 60 * 60 * 1000
