import { z } from 'zod'
import { IPC } from '../../shared/ipc-channels'
import {
  getAvailableDates,
  getDayBounds,
  getScreenshotsByDate,
  getScreenshotsByTimeRange,
  type ScreenshotRow
} from '../db/repositories/screenshots'
import { registerHandler } from './_helpers'

const dateSchema = z.tuple([z.string()])
const rangeSchema = z.tuple([z.number(), z.number()])

function withBooleanIdle(
  row: ScreenshotRow
): Omit<ScreenshotRow, 'is_idle'> & { is_idle: boolean } {
  return { ...row, is_idle: !!row.is_idle }
}

export function registerScreenshotHandlers(): void {
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
}
