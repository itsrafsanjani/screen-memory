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
  screenshot_id: number
  timestamp: number
  text_snippet: string
  display_id: string
  file_path: string
}

export interface ElectronAPI {
  // Screenshots
  getScreenshotsByDate(date: string): Promise<ScreenshotRecord[]>
  getAvailableDates(): Promise<string[]>
  getDayBounds(date: string): Promise<DayBounds>
  getScreenshotsByTimeRange(start: number, end: number): Promise<ScreenshotRecord[]>

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
  generateSummary(startMs: number, endMs: number): Promise<void>
  onSummaryChunk(cb: (chunk: string) => void): () => void
  onSummaryDone(cb: () => void): () => void
  onSummaryError(cb: (error: string) => void): () => void

  // Events from main
  onOpenSettings(cb: () => void): () => void
}
