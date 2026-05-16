import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { ZodType, ZodTuple } from 'zod'
import { err, ok, toErrorMessage, type Result } from '../../shared/result'

type HandlerFn<A extends unknown[], R> = (event: IpcMainInvokeEvent, ...args: A) => Promise<R> | R

export function registerHandler<A extends unknown[], R>(
  channel: string,
  schema: ZodTuple<ZodType[]> | null,
  handler: HandlerFn<A, R>
): void {
  ipcMain.handle(channel, async (event, ...rawArgs: unknown[]): Promise<Result<R>> => {
    try {
      let args: A
      if (schema) {
        const parsed = schema.safeParse(rawArgs)
        if (!parsed.success) {
          return err(`Invalid arguments for ${channel}: ${parsed.error.message}`)
        }
        args = parsed.data as unknown as A
      } else {
        args = rawArgs as A
      }
      const data = await handler(event, ...args)
      return ok(data)
    } catch (e) {
      console.error(`IPC handler ${channel} failed:`, e)
      return err(toErrorMessage(e))
    }
  })
}
