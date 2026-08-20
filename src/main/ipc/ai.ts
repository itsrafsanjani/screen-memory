import { z } from 'zod'
import { IPC } from '../../shared/ipc-channels'
import { registerHandler } from './_helpers'
import type { AiService } from '../ai-service'

const summarySchema = z.tuple([z.number(), z.number(), z.boolean()])

interface Ctx {
  ai: AiService
}

export function registerAiHandlers(ctx: Ctx): void {
  registerHandler(
    IPC.ai.generateSummary,
    summarySchema,
    async (e, startMs: number, endMs: number, includeOcr: boolean) => {
      await ctx.ai.streamSummary(startMs, endMs, e.sender, includeOcr)
    }
  )
}
