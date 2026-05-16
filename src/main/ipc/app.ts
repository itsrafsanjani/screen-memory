import { app } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { registerHandler } from './_helpers'

export function registerAppHandlers(): void {
  registerHandler(IPC.app.getVersion, null, () => app.getVersion())
}
