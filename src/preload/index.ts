import { contextBridge, ipcRenderer } from 'electron'
import type { ScreenshotRecord, DayBounds } from '../types'

const api = {
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
  getNativeTheme(): Promise<boolean> {
    return ipcRenderer.invoke('get-native-theme')
  },
  onThemeChanged(cb: (isDark: boolean) => void): () => void {
    const handler = (_event: Electron.IpcRendererEvent, isDark: boolean): void => cb(isDark)
    ipcRenderer.on('theme-changed', handler)
    return () => ipcRenderer.removeListener('theme-changed', handler)
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('electronAPI', api)
} else {
  // @ts-ignore
  window.electronAPI = api
}
