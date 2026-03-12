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

export interface ElectronAPI {
  getScreenshotsByDate(date: string): Promise<ScreenshotRecord[]>
  getAvailableDates(): Promise<string[]>
  getDayBounds(date: string): Promise<DayBounds>
  getScreenshotsByTimeRange(start: number, end: number): Promise<ScreenshotRecord[]>
  startCapture(): Promise<void>
  stopCapture(): Promise<void>
  getCaptureStatus(): Promise<boolean>
  onCaptureStatusChanged(cb: (status: boolean) => void): () => void
  getNativeTheme(): Promise<boolean>
  onThemeChanged(cb: (isDark: boolean) => void): () => void
}
