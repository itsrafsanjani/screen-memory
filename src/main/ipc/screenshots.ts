import { z } from 'zod'
import { clipboard, dialog, nativeImage, shell } from 'electron'
import { copyFileSync } from 'fs'
import { basename } from 'path'
import { IPC } from '../../shared/ipc-channels'
import type { StorageService } from '../storage-service'
import {
  deleteScreenshotsInRange,
  getAvailableDates,
  getDayBounds,
  getScreenshotsByDate,
  getScreenshotsByTimeRange,
  type ScreenshotRow
} from '../db/repositories/screenshots'
import { deleteOcrInRange } from '../db/repositories/ocr'
import { getTimelineWindow } from '../app-window'
import { resolveExistingFileInsideRoot } from '../path-containment'
import { registerHandler } from './_helpers'

const dateSchema = z.tuple([z.string()])
const rangeSchema = z.tuple([z.number(), z.number()])
const pathSchema = z.tuple([z.string()])

function withBooleanIdle(
  row: ScreenshotRow
): Omit<ScreenshotRow, 'is_idle'> & { is_idle: boolean } {
  return { ...row, is_idle: !!row.is_idle }
}

export function resolveInsideStorage(storage: StorageService, relativePath: string): string {
  const absolute = resolveExistingFileInsideRoot(storage.getBasePath(), relativePath)
  if (!absolute) {
    throw new Error('Could not access that screenshot file')
  }
  return absolute
}

export function registerScreenshotHandlers(ctx: { storage: StorageService }): void {
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

  registerHandler(IPC.screenshots.deleteRange, rangeSchema, (_e, start: number, end: number) => {
    const [from, to] = start <= end ? [start, end] : [end, start]
    const rows = getScreenshotsByTimeRange(from, to)
    ctx.storage.deleteFiles(rows.map((r) => r.file_path))
    const deletedScreenshots = deleteScreenshotsInRange(from, to)
    const deletedOcr = deleteOcrInRange(from, to)
    return { deletedScreenshots, deletedOcr }
  })

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
