import { z } from 'zod'
import { IPC } from '../../shared/ipc-channels'
import { registerHandler } from './_helpers'
import { getCommitsByDateRange, getGitRepos } from '../db/repositories/git'
import type { GitService } from '../git-service'

const rangeSchema = z.tuple([z.number(), z.number()])

interface Ctx {
  git: GitService
}

export function registerGitHandlers(ctx: Ctx): void {
  registerHandler(IPC.git.getCommitsByDate, rangeSchema, (_e, start: number, end: number) =>
    getCommitsByDateRange(start, end)
  )

  registerHandler(IPC.git.getRepos, null, () => getGitRepos())

  registerHandler(IPC.git.scanRepos, null, async () => {
    await ctx.git.scanRepos()
    await ctx.git.pollAllRepos()
  })
}
