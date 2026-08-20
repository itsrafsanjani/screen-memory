export interface ScreenshotRecord {
  id: number
  timestamp: number
  display_id: string
  file_path: string
  width: number
  height: number
  file_size: number
  is_idle: boolean
}

export interface DayBounds {
  first: number
  last: number
}

export interface GitCommit {
  id: number
  repo_path: string
  repo_name: string
  commit_hash: string
  timestamp: number
  author_name: string
  author_email: string
  message: string
  files_changed: number
  insertions: number
  deletions: number
}

export interface GitRepo {
  id: number
  path: string
  name: string
  is_excluded: number
  last_scanned: number
}

export interface OcrResult {
  id: number
  screenshot_id: number
  text: string
  confidence: number
}

export interface OcrSearchResult {
  screenshot_id: number | null
  timestamp: number
  text_snippet: string
  display_id: string
  file_path: string | null
}

export interface RunningApp {
  bundleId: string
  name: string
}

/** An app the user has chosen to keep out of screenshots. */
export type ExcludedApp = RunningApp

/**
 * The frontmost window on one display, as reported by the native helper.
 * Everything but `displayId` is absent when the helper could not identify an
 * owner for that display's frontmost window.
 */
export interface DisplayWindow {
  displayId: string
  bundleId?: string
  name?: string
  /** Share of the display covered by the window, 0…1. */
  coverage?: number
  isFullscreen?: boolean
}

export interface AppState {
  frontmost?: {
    bundleId: string
    name: string
    pid: number
  }
  displays: DisplayWindow[]
}

export interface AppUsageSegment {
  id: number
  bundle_id: string
  app_name: string
  started_at: number
  ended_at: number
  duration_ms: number
}

export interface AppUsageTotal {
  bundle_id: string
  app_name: string
  duration_ms: number
}

export interface MigrationProgress {
  phase:
    | 'idle'
    | 'preparing'
    | 'backup'
    | 'migrate-schema'
    | 'copy-table'
    | 'verify'
    | 'swap'
    | 'done'
    | 'error'
  table?: string
  rowsDone?: number
  rowsTotal?: number
  message?: string
}

export interface ElectronAPI {
  // Screenshots
  getScreenshotsByDate(date: string): Promise<ScreenshotRecord[]>
  getAvailableDates(): Promise<string[]>
  getDayBounds(date: string): Promise<DayBounds | null>
  getScreenshotsByTimeRange(start: number, end: number): Promise<ScreenshotRecord[]>
  copyScreenshotToClipboard(filePath: string): Promise<void>
  saveScreenshotAs(filePath: string): Promise<string | null>
  revealScreenshotInFinder(filePath: string): Promise<void>

  // App usage
  getAppUsage(date: string): Promise<AppUsageSegment[]>

  // Applications
  isAppStateAvailable(): Promise<boolean>
  getRunningApps(): Promise<RunningApp[]>
  pickApplication(): Promise<RunningApp | null>

  // Capture
  startCapture(): Promise<void>
  stopCapture(): Promise<void>
  getCaptureStatus(): Promise<boolean>
  onCaptureStatusChanged(cb: (status: boolean) => void): () => void

  // Theme
  getNativeTheme(): Promise<boolean>
  onThemeChanged(cb: (isDark: boolean) => void): () => void

  // Settings
  getAllSettings(): Promise<Record<string, string>>
  setSetting(key: string, value: string): Promise<void>
  getStorageUsage(): Promise<number>
  openDirectoryDialog(): Promise<string | null>

  // Git
  getGitCommitsByDate(start: number, end: number): Promise<GitCommit[]>
  getGitRepos(): Promise<GitRepo[]>
  scanGitRepos(): Promise<void>

  // OCR
  searchOcr(query: string, startMs?: number, endMs?: number): Promise<OcrSearchResult[]>
  getOcrText(screenshotId: number): Promise<string | null>

  // AI Summary
  generateSummary(startMs: number, endMs: number, includeOcr: boolean): Promise<void>
  onSummaryChunk(cb: (chunk: string) => void): () => void
  onSummaryDone(cb: () => void): () => void
  onSummaryError(cb: (error: string) => void): () => void

  // Events from main
  onOpenSettings(cb: () => void): () => void

  // Migration
  onMigrationProgress(cb: (progress: MigrationProgress) => void): () => void

  // App info
  getAppVersion(): Promise<string>
}
