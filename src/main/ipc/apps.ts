import { dialog } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import type { AppStateService } from '../app-state-service'
import { getTimelineWindow } from '../app-window'
import { registerHandler } from './_helpers'

interface Ctx {
  appState: AppStateService
}

export function registerAppsHandlers(ctx: Ctx): void {
  registerHandler(IPC.apps.isAvailable, null, () => ctx.appState.isAvailable())

  registerHandler(IPC.apps.getRunning, null, () => ctx.appState.listRunningApps())

  // Picking an app returns its bundle id, which is what exclusion matches on —
  // the helper reads it so we don't have to parse a binary Info.plist here.
  registerHandler(IPC.apps.pickApplication, null, async () => {
    const win = getTimelineWindow()
    const options: Electron.OpenDialogOptions = {
      title: 'Choose an application',
      defaultPath: '/Applications',
      // No treatPackageAsDirectory: an .app must be selectable as a file
      // rather than opened into.
      properties: ['openFile'],
      filters: [{ name: 'Applications', extensions: ['app'] }]
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    return ctx.appState.readAppBundle(result.filePaths[0])
  })
}
