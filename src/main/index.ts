import {
  app,
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
import { StorageService } from './storage-service'
import { CaptureService } from './capture-service'
import { GitService } from './git-service'
import { OcrService } from './ocr-service'
import { AiService } from './ai-service'
import { toggleTimelineWindow, getTimelineWindow, createTimelineWindow } from './app-window'
import { pathToFileURL } from 'url'
import { join } from 'path'
import { closeDb } from './db/client'
import { runMigrationsIfNeeded } from './db/migration-runner'
import { getSetting } from './db/repositories/settings'
import { deleteScreenshotsOlderThan } from './db/repositories/screenshots'
import { deleteOcrOlderThan } from './db/repositories/ocr'
import { registerAllIpcHandlers } from './ipc'
import { IPC } from '../shared/ipc-channels'
import {
  DEFAULT_SCREENSHOT_RETENTION_DAYS,
  DEFAULT_OCR_RETENTION_DAYS,
  DEFAULT_GIT_SCAN_INTERVAL_MINUTES,
  DEFAULT_GIT_POLL_INTERVAL_MINUTES,
  MS_PER_DAY
} from '../shared/constants'

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
let storage: StorageService
let capture: CaptureService
let gitService: GitService
let ocrService: OcrService
let aiService: AiService

const CSP_HEADER =
  "default-src 'self' screenmemory:; " +
  "script-src 'self'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: screenmemory:; " +
  "font-src 'self' data:; " +
  "connect-src 'self' screenmemory:;"

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
      click: async () => {
        if (isRecording) {
          capture.stop()
        } else if (hasScreenRecordingPermission()) {
          capture.start()
        } else {
          await promptForScreenRecordingPermission()
        }
        updateTrayMenu()
      }
    },
    { type: 'separator' },
    {
      label: 'Settings...',
      click: () => {
        const win = getTimelineWindow() || createTimelineWindow()
        win.webContents.send(IPC.app.openSettings)
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

function registerProtocol(): void {
  protocol.handle('screenmemory', async (request) => {
    const filePath = decodeURIComponent(request.url.replace('screenmemory://', ''))
    const absolutePath = storage.getAbsolutePath(filePath)
    const response = await net.fetch(pathToFileURL(absolutePath).toString())
    // Attach CSP header to every served asset response
    response.headers.set('Content-Security-Policy', CSP_HEADER)
    return response
  })
}

function hasScreenRecordingPermission(): boolean {
  if (process.platform !== 'darwin') return true
  return systemPreferences.getMediaAccessStatus('screen') === 'granted'
}

async function promptForScreenRecordingPermission(): Promise<void> {
  const { shell } = await import('electron')
  const result = await dialog.showMessageBox({
    type: 'warning',
    title: 'Screen Recording Permission Required',
    message: 'Screen Memory needs screen recording permission to capture screenshots.',
    detail:
      'Please go to System Settings > Privacy & Security > Screen Recording and enable Screen Memory.',
    buttons: ['Open System Settings', 'Cancel'],
    defaultId: 0
  })

  if (result.response === 0) {
    shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
    )
  }
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

  createApplicationMenu()

  // Create the timeline window early so the renderer can show a migration overlay
  storage = new StorageService()
  registerProtocol()

  const win = createTimelineWindow()

  // Wait for the renderer to be ready before sending migration progress events.
  await new Promise<void>((resolve) => {
    if (win.webContents.isLoadingMainFrame()) {
      win.webContents.once('did-finish-load', () => resolve())
    } else {
      resolve()
    }
  })

  try {
    await runMigrationsIfNeeded(win.webContents)
  } catch (e) {
    console.error('Database migration failed:', e)
    const message = e instanceof Error ? e.message : String(e)
    win.webContents.send(IPC.migration.progress, { phase: 'error', message })
    dialog.showErrorBox(
      'Database migration failed',
      'Screen Memory could not migrate its database. The original database was preserved as a .bak file. Details: ' +
        message
    )
    return
  }

  // Init dependent services AFTER DB is ready
  capture = new CaptureService(storage)
  gitService = new GitService()
  ocrService = new OcrService()
  aiService = new AiService()

  // Apply capture settings
  const activeMs = getSetting('capture.activeIntervalMs')
  const idleMs = getSetting('capture.idleIntervalMs')
  const quality = getSetting('capture.jpegQuality')
  capture.updateIntervals(
    activeMs ? parseInt(activeMs, 10) : undefined,
    idleMs ? parseInt(idleMs, 10) : undefined,
    quality ? parseInt(quality, 10) : undefined
  )

  // Stage 1: screenshot file + row retention
  const screenshotRetentionDaysSetting = getSetting('storage.retentionDays')
  const screenshotRetentionDays = screenshotRetentionDaysSetting
    ? parseInt(screenshotRetentionDaysSetting, 10)
    : DEFAULT_SCREENSHOT_RETENTION_DAYS
  const screenshotCutoff = Date.now() - screenshotRetentionDays * MS_PER_DAY
  const removedDirs = storage.cleanupOldData(screenshotRetentionDays)
  if (removedDirs.length > 0) {
    deleteScreenshotsOlderThan(screenshotCutoff)
    console.log('Cleaned up old screenshots:', removedDirs)
  }

  // Stage 2: OCR retention
  const ocrRetentionDaysSetting = getSetting('storage.ocrRetentionDays')
  const ocrRetentionDays = ocrRetentionDaysSetting
    ? parseInt(ocrRetentionDaysSetting, 10)
    : DEFAULT_OCR_RETENTION_DAYS
  const effectiveOcrDays = Math.max(ocrRetentionDays, screenshotRetentionDays)
  const ocrCutoff = Date.now() - effectiveOcrDays * MS_PER_DAY
  const deletedOcr = deleteOcrOlderThan(ocrCutoff)
  if (deletedOcr > 0) {
    console.log(`Cleaned up ${deletedOcr} OCR rows`)
  }

  // Wire OCR pipeline
  if (ocrService.isAvailable()) {
    capture.setCaptureCallback((job) => {
      ocrService.enqueue(job)
    })
    console.log('OCR service enabled')
  } else {
    console.log('OCR binary not found, OCR disabled')
  }

  // Capture status change notifications
  capture.setStatusCallback((running) => {
    const target = getTimelineWindow()
    if (target && !target.isDestroyed()) {
      target.webContents.send(IPC.capture.statusChanged, running)
    }
    updateTrayMenu()
  })

  nativeTheme.on('updated', () => {
    const target = getTimelineWindow()
    if (target && !target.isDestroyed()) {
      target.webContents.send(IPC.theme.changed, nativeTheme.shouldUseDarkColors)
    }
  })

  registerAllIpcHandlers({
    capture,
    storage,
    git: gitService,
    ai: aiService,
    onCaptureStatusChange: updateTrayMenu
  })

  tray = new Tray(loadTrayIcon())
  tray.setToolTip('Screen Memory')
  tray.on('click', () => toggleTimelineWindow())
  updateTrayMenu()

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

  if (hasScreenRecordingPermission()) {
    capture.start()
    updateTrayMenu()
  }

  const scanInterval = getSetting('git.scanIntervalMinutes')
  const pollInterval = getSetting('git.pollIntervalMinutes')
  gitService.start(
    scanInterval ? parseInt(scanInterval, 10) : DEFAULT_GIT_SCAN_INTERVAL_MINUTES,
    pollInterval ? parseInt(pollInterval, 10) : DEFAULT_GIT_POLL_INTERVAL_MINUTES
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
  closeDb()
})
