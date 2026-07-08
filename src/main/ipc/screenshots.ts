import { z } from 'zod'
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
import { registerHandler } from './_helpers'

const dateSchema = z.tuple([z.string()])
const rangeSchema = z.tuple([z.number(), z.number()])

function withBooleanIdle(
  row: ScreenshotRow
): Omit<ScreenshotRow, 'is_idle'> & { is_idle: boolean } {
  return { ...row, is_idle: !!row.is_idle }
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
}
