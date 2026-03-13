import { contextBridge, ipcRenderer } from 'electron'
import type { ScreenshotRecord, DayBounds, GitCommit, GitRepo, OcrSearchResult } from '../types'

const api = {
  // Screenshots
  getScreenshotsByDate(date: string): Promise<ScreenshotRecord[]> {
    return ipcRenderer.invoke('get-screenshots-by-date', date)
  },
  getAvailableDates(): Promise<string[]> {
    return ipcRenderer.invoke('get-available-dates')
  },
  getDayBounds(date: string): Promise<DayBounds> {
    return ipcRenderer.invoke('get-day-bounds', date)
  },
  getScreenshotsByTimeRange(start: number, end: number): Promise<ScreenshotRecord[]> {
    return ipcRenderer.invoke('get-screenshots-by-time-range', start, end)
  },

  // Capture
  startCapture(): Promise<void> {
    return ipcRenderer.invoke('start-capture')
  },
  stopCapture(): Promise<void> {
    return ipcRenderer.invoke('stop-capture')
  },
  getCaptureStatus(): Promise<boolean> {
    return ipcRenderer.invoke('get-capture-status')
  },
  onCaptureStatusChanged(cb: (status: boolean) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, status: boolean): void => cb(status)
    ipcRenderer.on('capture-status-changed', handler)
    return () => ipcRenderer.removeListener('capture-status-changed', handler)
  },

  // Theme
  getNativeTheme(): Promise<boolean> {
    return ipcRenderer.invoke('get-native-theme')
  },
  onThemeChanged(cb: (isDark: boolean) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, isDark: boolean): void => cb(isDark)
    ipcRenderer.on('theme-changed', handler)
    return () => ipcRenderer.removeListener('theme-changed', handler)
  },

  // Settings
  getAllSettings(): Promise<Record<string, string>> {
    return ipcRenderer.invoke('get-all-settings')
  },
  setSetting(key: string, value: string): Promise<void> {
    return ipcRenderer.invoke('set-setting', key, value)
  },
  getStorageUsage(): Promise<number> {
    return ipcRenderer.invoke('get-storage-usage')
  },
  openDirectoryDialog(): Promise<string | null> {
    return ipcRenderer.invoke('open-directory-dialog')
  },

  // Git
  getGitCommitsByDate(start: number, end: number): Promise<GitCommit[]> {
    return ipcRenderer.invoke('get-git-commits-by-date', start, end)
  },
  getGitRepos(): Promise<GitRepo[]> {
    return ipcRenderer.invoke('get-git-repos')
  },
  scanGitRepos(): Promise<void> {
    return ipcRenderer.invoke('scan-git-repos')
  },

  // OCR
  searchOcr(query: string, startMs?: number, endMs?: number): Promise<OcrSearchResult[]> {
    return ipcRenderer.invoke('search-ocr', query, startMs, endMs)
  },
  getOcrText(screenshotId: number): Promise<string | null> {
    return ipcRenderer.invoke('get-ocr-text', screenshotId)
  },

  // AI Summary
  generateSummary(startMs: number, endMs: number): Promise<void> {
    return ipcRenderer.invoke('generate-summary', startMs, endMs)
  },
  onSummaryChunk(cb: (chunk: string) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, chunk: string): void => cb(chunk)
    ipcRenderer.on('summary-chunk', handler)
    return () => ipcRenderer.removeListener('summary-chunk', handler)
  },
  onSummaryDone(cb: () => void): () => void {
    const handler = (): void => cb()
    ipcRenderer.on('summary-done', handler)
    return () => ipcRenderer.removeListener('summary-done', handler)
  },
  onSummaryError(cb: (error: string) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, error: string): void => cb(error)
    ipcRenderer.on('summary-error', handler)
    return () => ipcRenderer.removeListener('summary-error', handler)
  },

  // Events from main
  onOpenSettings(cb: () => void): () => void {
    const handler = (): void => cb()
    ipcRenderer.on('open-settings', handler)
    return () => ipcRenderer.removeListener('open-settings', handler)
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('electronAPI', api)
} else {
  // @ts-ignore - fallback for non-isolated context
  window.electronAPI = api
}
