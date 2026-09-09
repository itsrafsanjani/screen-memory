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

  registerHandler(IPC.apps.pickApplication, null, async () => {
    const win = getTimelineWindow()
    const options: Electron.OpenDialogOptions = {
      title: 'Choose an application',
      defaultPath: '/Applications',
      properties: ['openFile'],
      filters: [{ name: 'Applications', extensions: ['app'] }]
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null

    const picked = result.filePaths[0]
    const bundle = await ctx.appState.readAppBundle(picked)
    if (!bundle) {
      throw new Error(`Could not read an application bundle at ${picked}`)
    }
    return bundle
  })
}
