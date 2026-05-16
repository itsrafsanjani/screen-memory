import { z } from 'zod'
import { IPC } from '../../shared/ipc-channels'
import { registerHandler } from './_helpers'
import type { AiService } from '../ai-service'

const rangeSchema = z.tuple([z.number(), z.number()])

interface Ctx {
  ai: AiService
}

export function registerAiHandlers(ctx: Ctx): void {
  registerHandler(
    IPC.ai.generateSummary,
    rangeSchema,
    async (e, startMs: number, endMs: number) => {
      await ctx.ai.streamSummary(startMs, endMs, e.sender)
    }
  )
}
