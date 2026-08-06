import { z } from 'zod'
import { dialog } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { registerHandler } from './_helpers'
import { getAllSettings, setSetting } from '../db/repositories/settings'
import { applyCaptureSettings } from '../capture-settings'
import type { CaptureService } from '../capture-service'
import type { StorageService } from '../storage-service'
import { getTimelineWindow } from '../app-window'

const setSettingSchema = z.tuple([z.string(), z.string()])

interface Ctx {
  capture: CaptureService
  storage: StorageService
}

export function registerSettingsHandlers(ctx: Ctx): void {
  registerHandler(IPC.settings.getAll, null, () => getAllSettings())

  registerHandler(IPC.settings.set, setSettingSchema, (_e, key: string, value: string) => {
    setSetting(key, value)

    // Apply settings changes live for capture-related keys
    if (key.startsWith('capture.')) {
      applyCaptureSettings(ctx.capture)
    }
  })

  registerHandler(IPC.settings.getStorageUsage, null, () => ctx.storage.getStorageUsage())

  registerHandler(IPC.settings.openDirectoryDialog, null, async () => {
    const win = getTimelineWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}
