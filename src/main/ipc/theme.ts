import { nativeTheme } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { registerHandler } from './_helpers'

export function registerThemeHandlers(): void {
  registerHandler(IPC.theme.getNative, null, () => nativeTheme.shouldUseDarkColors)
}
