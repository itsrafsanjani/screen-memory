import { z } from 'zod'
import { IPC } from '../../shared/ipc-channels'
import { registerHandler } from './_helpers'
import { getOcrByScreenshotId, searchOcr } from '../db/repositories/ocr'

const searchSchema = z.tuple([z.string(), z.number().optional(), z.number().optional()])
const idSchema = z.tuple([z.number()])

export function registerOcrHandlers(): void {
  registerHandler(
    IPC.ocr.search,
    searchSchema,
    (_e, query: string, startMs?: number, endMs?: number) => searchOcr(query, startMs, endMs)
  )

  registerHandler(IPC.ocr.getText, idSchema, (_e, screenshotId: number) => {
    const result = getOcrByScreenshotId(screenshotId)
    return result?.text ?? null
  })
}
