import {
  app,
  desktopCapturer,
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
import { autoUpdater } from 'electron-updater'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import { DatabaseService } from './database-service'
import { StorageService } from './storage-service'
import { CaptureService } from './capture-service'
import { GitService } from './git-service'
import { OcrService } from './ocr-service'
import { AiService } from './ai-service'
import { toggleTimelineWindow, getTimelineWindow, createTimelineWindow } from './app-window'
import { pathToFileURL } from 'url'
import { join } from 'path'

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
let gitService: GitService
let ocrService: OcrService
let aiService: AiService

function loadTrayIcon(): Electron.NativeImage {
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, 'iconTemplate.png')
    : join(__dirname, '../../resources/iconTemplate.png')

  const img = nativeImage.createFromPath(iconPath)
  img.setTemplateImage(true)
  return img
}

function updateTrayMenu(): void {
  if (!tray) return
  const isRecording = capture.isRunning()

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
      label: 'Settings...',
      click: () => {
        const win = getTimelineWindow() || createTimelineWindow()
        win.webContents.send('open-settings')
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
  // --- Screenshot handlers ---
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

  // --- Capture handlers ---
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

  // --- Settings handlers ---
  ipcMain.handle('get-all-settings', () => {
    return db.getAllSettings()
  })

  ipcMain.handle('set-setting', (_e, key: string, value: string) => {
    db.setSetting(key, value)

    // Apply settings changes live
    if (key.startsWith('capture.')) {
      const activeMs = db.getSetting('capture.activeIntervalMs')
      const idleMs = db.getSetting('capture.idleIntervalMs')
      const quality = db.getSetting('capture.jpegQuality')
      capture.updateIntervals(
        activeMs ? parseInt(activeMs, 10) : undefined,
        idleMs ? parseInt(idleMs, 10) : undefined,
        quality ? parseInt(quality, 10) : undefined
      )
    }
  })

  ipcMain.handle('get-storage-usage', () => {
    return storage.getStorageUsage()
  })

  ipcMain.handle('open-directory-dialog', async () => {
    const win = getTimelineWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // --- Git handlers ---
  ipcMain.handle('get-git-commits-by-date', (_e, start: number, end: number) => {
    return db.getCommitsByDateRange(start, end)
  })

  ipcMain.handle('get-git-repos', () => {
    return db.getGitRepos()
  })

  ipcMain.handle('scan-git-repos', async () => {
    await gitService.scanRepos()
    await gitService.pollAllRepos()
  })

  // --- OCR handlers ---
  ipcMain.handle('search-ocr', (_e, query: string, startMs?: number, endMs?: number) => {
    return db.searchOcr(query, startMs, endMs)
  })

  ipcMain.handle('get-ocr-text', (_e, screenshotId: number) => {
    const result = db.getOcrByScreenshotId(screenshotId)
    return result?.text ?? null
  })

  // --- AI Summary handler ---
  ipcMain.handle('generate-summary', async (e, startMs: number, endMs: number) => {
    await aiService.streamSummary(startMs, endMs, e.sender)
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

  // Fast path: if the API reports granted, trust it
  const status = systemPreferences.getMediaAccessStatus('screen')
  if (status === 'granted') return true

  // Functional test: attempt an actual capture to verify permission
  // getMediaAccessStatus is unreliable with ad-hoc signed apps
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1, height: 1 }
    })
    const hasValidSource = sources.some((source) => !source.thumbnail.isEmpty())
    if (hasValidSource) return true
  } catch {
    // Capture failed — permission is genuinely missing
  }

  // Permission truly not granted — show dialog
  const result = await dialog.showMessageBox({
    type: 'warning',
    title: 'Screen Recording Permission Required',
    message: 'Screen Memory needs screen recording permission to capture screenshots.',
    detail:
      'Please go to System Settings > Privacy & Security > Screen Recording and enable Screen Memory.',
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

function createApplicationMenu(): void {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { role: 'services' as const },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'hideOthers' as const },
              { role: 'unhide' as const },
              { type: 'separator' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Timeline',
          accelerator: 'CmdOrCtrl+O',
          click: () => toggleTimelineWindow()
        },
        { type: 'separator' },
        { role: 'close' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [{ type: 'separator' as const }, { role: 'front' as const }] : [])
      ]
    }
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.screenmemory')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Set up application menu
  createApplicationMenu()

  // Register custom protocol before any window loads
  registerProtocol()

  // Init services
  db = new DatabaseService()
  storage = new StorageService()
  capture = new CaptureService(db, storage)
  gitService = new GitService(db)
  ocrService = new OcrService(db)
  aiService = new AiService(db)

  // Load capture settings
  const activeMs = db.getSetting('capture.activeIntervalMs')
  const idleMs = db.getSetting('capture.idleIntervalMs')
  const quality = db.getSetting('capture.jpegQuality')
  capture.updateIntervals(
    activeMs ? parseInt(activeMs, 10) : undefined,
    idleMs ? parseInt(idleMs, 10) : undefined,
    quality ? parseInt(quality, 10) : undefined
  )

  // Auto-cleanup old data
  const retentionDaysSetting = db.getSetting('storage.retentionDays')
  const retentionDays = retentionDaysSetting ? parseInt(retentionDaysSetting, 10) : 7
  const removedDirs = storage.cleanupOldData(retentionDays)
  if (removedDirs.length > 0) {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
    db.deleteOlderThan(cutoff)
    console.log('Cleaned up old data:', removedDirs)
  }

  // Connect OCR to capture pipeline
  if (ocrService.isAvailable()) {
    capture.setCaptureCallback((screenshotId, absolutePath) => {
      ocrService.enqueue(screenshotId, absolutePath)
    })
    console.log('OCR service enabled')
  } else {
    console.log('OCR binary not found, OCR disabled')
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
  tray = new Tray(loadTrayIcon())
  tray.setToolTip('Screen Memory')
  tray.on('click', () => toggleTimelineWindow())
  updateTrayMenu()

  // Configure auto-updater
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    dialog
      .showMessageBox({
        type: 'info',
        title: 'Update Available',
        message: `Version ${info.version} is available. Would you like to download it?`,
        buttons: ['Download', 'Later'],
        defaultId: 0
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.downloadUpdate()
        }
      })
  })

  autoUpdater.on('update-downloaded', () => {
    dialog
      .showMessageBox({
        type: 'info',
        title: 'Update Ready',
        message: 'Update has been downloaded. The app will restart to install it.',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0
      })
      .then((result) => {
        if (result.response === 0) {
          autoUpdater.quitAndInstall()
        }
      })
  })

  autoUpdater.on('error', (err) => {
    console.error('Auto-updater error:', err)
  })

  autoUpdater.checkForUpdates()

  // Check permission and start capture
  const hasPermission = await checkScreenRecordingPermission()
  if (hasPermission) {
    capture.start()
    updateTrayMenu()
  }

  // Start git service
  const scanInterval = db.getSetting('git.scanIntervalMinutes')
  const pollInterval = db.getSetting('git.pollIntervalMinutes')
  gitService.start(
    scanInterval ? parseInt(scanInterval, 10) : 60,
    pollInterval ? parseInt(pollInterval, 10) : 5
  )
})

app.on('window-all-closed', () => {
  // Don't quit on window close — app stays running for tray + capture
})

app.on('activate', () => {
  toggleTimelineWindow()
})

app.on('before-quit', () => {
  capture?.stop()
  gitService?.stop()
  db?.close()
})
