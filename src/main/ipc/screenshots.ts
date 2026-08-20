import { z } from 'zod'
import { clipboard, dialog, nativeImage, shell } from 'electron'
import { copyFileSync, existsSync } from 'fs'
import { basename } from 'path'
import { IPC } from '../../shared/ipc-channels'
import {
  getAvailableDates,
  getDayBounds,
  getScreenshotsByDate,
  getScreenshotsByTimeRange,
  type ScreenshotRow
} from '../db/repositories/screenshots'
import type { StorageService } from '../storage-service'
import { getTimelineWindow } from '../app-window'
import { resolveInsideRoot } from '../path-containment'
import { registerHandler } from './_helpers'

const dateSchema = z.tuple([z.string()])
const rangeSchema = z.tuple([z.number(), z.number()])
const pathSchema = z.tuple([z.string()])

interface Ctx {
  storage: StorageService
}

function withBooleanIdle(
  row: ScreenshotRow
): Omit<ScreenshotRow, 'is_idle'> & { is_idle: boolean } {
  return { ...row, is_idle: !!row.is_idle }
}

/**
 * Resolves a renderer-supplied *relative* screenshot path against the storage
 * root, rejecting anything that escapes it. The renderer only ever holds
 * relative paths, so a path that resolves outside is either a bug or an attempt
 * to read arbitrary files through these handlers.
 */
function resolveInsideStorage(storage: StorageService, relativePath: string): string {
  const absolute = resolveInsideRoot(storage.getBasePath(), relativePath)
  if (!absolute) {
    throw new Error('Refusing to access a file outside the screenshot directory')
  }
  if (!existsSync(absolute)) {
    throw new Error('Screenshot file no longer exists')
  }
  return absolute
}

export function registerScreenshotHandlers(ctx: Ctx): void {
  registerHandler(IPC.screenshots.getByDate, dateSchema, (_e, date: string) =>
    getScreenshotsByDate(date).map(withBooleanIdle)
  )

  registerHandler(IPC.screenshots.getAvailableDates, null, () => getAvailableDates())

  registerHandler(IPC.screenshots.getDayBounds, dateSchema, (_e, date: string) =>
    getDayBounds(date)
  )

  registerHandler(IPC.screenshots.getByTimeRange, rangeSchema, (_e, start: number, end: number) =>
    getScreenshotsByTimeRange(start, end).map(withBooleanIdle)
  )

  registerHandler(IPC.screenshots.copyToClipboard, pathSchema, (_e, relativePath: string) => {
    const absolute = resolveInsideStorage(ctx.storage, relativePath)
    const image = nativeImage.createFromPath(absolute)
    if (image.isEmpty()) throw new Error('Could not read the screenshot image')
    clipboard.writeImage(image)
  })

  registerHandler(IPC.screenshots.saveAs, pathSchema, async (_e, relativePath: string) => {
    const absolute = resolveInsideStorage(ctx.storage, relativePath)
    const win = getTimelineWindow()
    const options = { defaultPath: basename(absolute) }
    const result = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return null
    copyFileSync(absolute, result.filePath)
    return result.filePath
  })

  registerHandler(IPC.screenshots.revealInFinder, pathSchema, (_e, relativePath: string) => {
    shell.showItemInFolder(resolveInsideStorage(ctx.storage, relativePath))
  })
}
