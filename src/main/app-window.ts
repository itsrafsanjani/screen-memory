import { BrowserWindow } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

let timelineWindow: BrowserWindow | null = null

export function getTimelineWindow(): BrowserWindow | null {
  return timelineWindow
}

export function createTimelineWindow(): BrowserWindow {
  if (timelineWindow && !timelineWindow.isDestroyed()) {
    timelineWindow.focus()
    return timelineWindow
  }

  timelineWindow = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 800,
    minHeight: 500,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 14 },
    vibrancy: 'under-window',
    resizable: true,
    show: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  timelineWindow.on('ready-to-show', () => {
    timelineWindow?.maximize()
    timelineWindow?.show()
  })

  timelineWindow.on('closed', () => {
    timelineWindow = null
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    timelineWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    timelineWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return timelineWindow
}

export function toggleTimelineWindow(): void {
  if (timelineWindow && !timelineWindow.isDestroyed() && timelineWindow.isVisible()) {
    timelineWindow.focus()
  } else {
    createTimelineWindow()
  }
}
