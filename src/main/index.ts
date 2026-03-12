import {
  app,
  ipcMain,
  Menu,
  net,
  protocol,
  systemPreferences,
  Tray,
  dialog,
  nativeImage,
  nativeTheme
} from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { DatabaseService } from './database-service'
import { StorageService } from './storage-service'
import { CaptureService } from './capture-service'
import { toggleTimelineWindow, getTimelineWindow } from './app-window'
import { pathToFileURL } from 'url'

// Register custom protocol scheme before app ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'screenmemory',
    privileges: {
      secure: true,
      supportFetchAPI: true,
      bypassCSP: false,
      stream: true
    }
  }
])

let tray: Tray | null = null
let db: DatabaseService
let storage: StorageService
let capture: CaptureService

function createTrayIcon(recording: boolean): Electron.NativeImage {
  // Create a simple 22x22 tray icon (template image for macOS)
  const size = 22
  const canvas = Buffer.alloc(size * size * 4, 0)

  // Draw a filled circle in the center
  const cx = size / 2
  const cy = size / 2
  const r = recording ? 7 : 6
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)
      if (dist <= r) {
        const idx = (y * size + x) * 4
        if (recording) {
          canvas[idx] = 0 // R
          canvas[idx + 1] = 0 // G
          canvas[idx + 2] = 0 // B
          canvas[idx + 3] = 255 // A
        } else {
          canvas[idx] = 0
          canvas[idx + 1] = 0
          canvas[idx + 2] = 0
          canvas[idx + 3] = 128 // semi-transparent for paused
        }
      }
    }
  }

  const img = nativeImage.createFromBuffer(canvas, { width: size, height: size })
  img.setTemplateImage(true)
  return img
}

function updateTrayMenu(): void {
  if (!tray) return
  const isRecording = capture.isRunning()

  tray.setImage(createTrayIcon(isRecording))

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Timeline',
      click: () => toggleTimelineWindow()
    },
    { type: 'separator' },
    {
      label: isRecording ? 'Pause Recording' : 'Start Recording',
      click: () => {
        if (isRecording) {
          capture.stop()
        } else {
          capture.start()
        }
        updateTrayMenu()
      }
    },
    { type: 'separator' },
    {
      label: 'Launch at Login',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (menuItem) => {
        app.setLoginItemSettings({
          openAtLogin: menuItem.checked,
          openAsHidden: true
        })
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => app.quit()
    }
  ])

  tray.setContextMenu(contextMenu)
}

function registerIpcHandlers(): void {
  ipcMain.handle('get-screenshots-by-date', (_e, date: string) => {
    const rows = db.getScreenshotsByDate(date)
    return rows.map((r) => ({ ...r, is_idle: !!r.is_idle }))
  })

  ipcMain.handle('get-available-dates', () => {
    return db.getAvailableDates()
  })

  ipcMain.handle('get-day-bounds', (_e, date: string) => {
    return db.getDayBounds(date)
  })

  ipcMain.handle('get-screenshots-by-time-range', (_e, start: number, end: number) => {
    const rows = db.getScreenshotsByTimeRange(start, end)
    return rows.map((r) => ({ ...r, is_idle: !!r.is_idle }))
  })

  ipcMain.handle('start-capture', () => {
    capture.start()
    updateTrayMenu()
  })

  ipcMain.handle('stop-capture', () => {
    capture.stop()
    updateTrayMenu()
  })

  ipcMain.handle('get-capture-status', () => {
    return capture.isRunning()
  })

  ipcMain.handle('get-native-theme', () => {
    return nativeTheme.shouldUseDarkColors
  })
}

function registerProtocol(): void {
  protocol.handle('screenmemory', (request) => {
    const filePath = decodeURIComponent(request.url.replace('screenmemory://', ''))
    const absolutePath = storage.getAbsolutePath(filePath)
    return net.fetch(pathToFileURL(absolutePath).toString())
  })
}

async function checkScreenRecordingPermission(): Promise<boolean> {
  if (process.platform !== 'darwin') return true

  const status = systemPreferences.getMediaAccessStatus('screen')
  if (status === 'granted') return true

  const result = await dialog.showMessageBox({
    type: 'warning',
    title: 'Screen Recording Permission Required',
    message: 'ScreenMemory needs screen recording permission to capture screenshots.',
    detail:
      'Please go to System Settings > Privacy & Security > Screen Recording and enable ScreenMemory.',
    buttons: ['Open System Settings', 'Quit'],
    defaultId: 0
  })

  if (result.response === 0) {
    const { shell } = await import('electron')
    shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
    )
  }

  return false
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.screenmemory')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Hide dock icon — menubar-only app
  app.dock?.hide()

  // Register custom protocol before any window loads
  registerProtocol()

  // Init services
  db = new DatabaseService()
  storage = new StorageService()
  capture = new CaptureService(db, storage)

  // Auto-cleanup old data (7 days retention)
  const removedDirs = storage.cleanupOldData(7)
  if (removedDirs.length > 0) {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    db.deleteOlderThan(cutoff)
    console.log('Cleaned up old data:', removedDirs)
  }

  // Capture status change → notify renderer
  capture.setStatusCallback((running) => {
    const win = getTimelineWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('capture-status-changed', running)
    }
    updateTrayMenu()
  })

  // Theme change → notify renderer
  nativeTheme.on('updated', () => {
    const win = getTimelineWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('theme-changed', nativeTheme.shouldUseDarkColors)
    }
  })

  // Register IPC handlers
  registerIpcHandlers()

  // Create tray
  tray = new Tray(createTrayIcon(false))
  tray.setToolTip('ScreenMemory')
  tray.on('click', () => toggleTimelineWindow())
  updateTrayMenu()

  // Check permission and start capture
  const hasPermission = await checkScreenRecordingPermission()
  if (hasPermission) {
    capture.start()
    updateTrayMenu()
  }
})

app.on('window-all-closed', () => {
  // Don't quit on window close — we're a menubar app
})

app.on('before-quit', () => {
  capture?.stop()
  db?.close()
})
