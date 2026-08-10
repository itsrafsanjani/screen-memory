import { z } from 'zod'
import { IPC } from '../../shared/ipc-channels'
import { getUsageByDate } from '../db/repositories/app-usage'
import { registerHandler } from './_helpers'

const dateSchema = z.tuple([z.string()])

export function registerUsageHandlers(): void {
  // Raw segments; the renderer derives totals and hourly buckets so it can
  // re-slice them without another round-trip.
  registerHandler(IPC.usage.getByDate, dateSchema, (_e, date: string) => getUsageByDate(date))
}
