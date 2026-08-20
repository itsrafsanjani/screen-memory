import { contextBridge, ipcRenderer } from 'electron'
import type {
  ScreenshotRecord,
  DayBounds,
  GitCommit,
  GitRepo,
  OcrSearchResult,
  AppUsageSegment,
  RunningApp
} from '../types'
import { IPC } from '../shared/ipc-channels'
import { unwrap, type Result } from '../shared/result'
import type { MigrationProgress } from '../main/db/migration-runner'

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = (await ipcRenderer.invoke(channel, ...args)) as Result<T>
  return unwrap(result)
}

const api = {
  // Screenshots
  getScreenshotsByDate(date: string): Promise<ScreenshotRecord[]> {
    return invoke(IPC.screenshots.getByDate, date)
  },
  getAvailableDates(): Promise<string[]> {
    return invoke(IPC.screenshots.getAvailableDates)
  },
  getDayBounds(date: string): Promise<DayBounds | null> {
    return invoke(IPC.screenshots.getDayBounds, date)
  },
  getScreenshotsByTimeRange(start: number, end: number): Promise<ScreenshotRecord[]> {
    return invoke(IPC.screenshots.getByTimeRange, start, end)
  },
  copyScreenshotToClipboard(filePath: string): Promise<void> {
    return invoke(IPC.screenshots.copyToClipboard, filePath)
  },
  saveScreenshotAs(filePath: string): Promise<string | null> {
    return invoke(IPC.screenshots.saveAs, filePath)
  },
  revealScreenshotInFinder(filePath: string): Promise<void> {
    return invoke(IPC.screenshots.revealInFinder, filePath)
  },

  // App usage
  getAppUsage(date: string): Promise<AppUsageSegment[]> {
    return invoke(IPC.usage.getByDate, date)
  },

  // Applications
  isAppStateAvailable(): Promise<boolean> {
    return invoke(IPC.apps.isAvailable)
  },
  getRunningApps(): Promise<RunningApp[]> {
    return invoke(IPC.apps.getRunning)
  },
  pickApplication(): Promise<RunningApp | null> {
    return invoke(IPC.apps.pickApplication)
  },

  // Capture
  startCapture(): Promise<void> {
    return invoke(IPC.capture.start)
  },
  stopCapture(): Promise<void> {
    return invoke(IPC.capture.stop)
  },
  getCaptureStatus(): Promise<boolean> {
    return invoke(IPC.capture.getStatus)
  },
  onCaptureStatusChanged(cb: (status: boolean) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, status: boolean): void => cb(status)
    ipcRenderer.on(IPC.capture.statusChanged, handler)
    return () => ipcRenderer.removeListener(IPC.capture.statusChanged, handler)
  },

  // Theme
  getNativeTheme(): Promise<boolean> {
    return invoke(IPC.theme.getNative)
  },
  onThemeChanged(cb: (isDark: boolean) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, isDark: boolean): void => cb(isDark)
    ipcRenderer.on(IPC.theme.changed, handler)
    return () => ipcRenderer.removeListener(IPC.theme.changed, handler)
  },

  // Settings
  getAllSettings(): Promise<Record<string, string>> {
    return invoke(IPC.settings.getAll)
  },
  setSetting(key: string, value: string): Promise<void> {
    return invoke(IPC.settings.set, key, value)
  },
  getStorageUsage(): Promise<number> {
    return invoke(IPC.settings.getStorageUsage)
  },
  openDirectoryDialog(): Promise<string | null> {
    return invoke(IPC.settings.openDirectoryDialog)
  },

  // Git
  getGitCommitsByDate(start: number, end: number): Promise<GitCommit[]> {
    return invoke(IPC.git.getCommitsByDate, start, end)
  },
  getGitRepos(): Promise<GitRepo[]> {
    return invoke(IPC.git.getRepos)
  },
  scanGitRepos(): Promise<void> {
    return invoke(IPC.git.scanRepos)
  },

  // OCR
  searchOcr(query: string, startMs?: number, endMs?: number): Promise<OcrSearchResult[]> {
    return invoke(IPC.ocr.search, query, startMs, endMs)
  },
  getOcrText(screenshotId: number): Promise<string | null> {
    return invoke(IPC.ocr.getText, screenshotId)
  },

  // AI Summary
  generateSummary(startMs: number, endMs: number, includeOcr: boolean): Promise<void> {
    return invoke(IPC.ai.generateSummary, startMs, endMs, includeOcr)
  },
  onSummaryChunk(cb: (chunk: string) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, chunk: string): void => cb(chunk)
    ipcRenderer.on(IPC.ai.summaryChunk, handler)
    return () => ipcRenderer.removeListener(IPC.ai.summaryChunk, handler)
  },
  onSummaryDone(cb: () => void): () => void {
    const handler = (): void => cb()
    ipcRenderer.on(IPC.ai.summaryDone, handler)
    return () => ipcRenderer.removeListener(IPC.ai.summaryDone, handler)
  },
  onSummaryError(cb: (error: string) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, error: string): void => cb(error)
    ipcRenderer.on(IPC.ai.summaryError, handler)
    return () => ipcRenderer.removeListener(IPC.ai.summaryError, handler)
  },

  // Events from main
  onOpenSettings(cb: () => void): () => void {
    const handler = (): void => cb()
    ipcRenderer.on(IPC.app.openSettings, handler)
    return () => ipcRenderer.removeListener(IPC.app.openSettings, handler)
  },

  // Migration
  onMigrationProgress(cb: (progress: MigrationProgress) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, progress: MigrationProgress): void =>
      cb(progress)
    ipcRenderer.on(IPC.migration.progress, handler)
    return () => ipcRenderer.removeListener(IPC.migration.progress, handler)
  },

  // App info
  getAppVersion(): Promise<string> {
    return invoke(IPC.app.getVersion)
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('electronAPI', api)
} else {
  // @ts-ignore - fallback for non-isolated context
  window.electronAPI = api
}
