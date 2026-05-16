import { dialog, systemPreferences } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import { registerHandler } from './_helpers'
import type { CaptureService } from '../capture-service'

interface Ctx {
  capture: CaptureService
  onStatusChange: () => void
}

function hasScreenRecordingPermission(): boolean {
  if (process.platform !== 'darwin') return true
  return systemPreferences.getMediaAccessStatus('screen') === 'granted'
}

async function promptForScreenRecordingPermission(): Promise<void> {
  const { shell } = await import('electron')
  const result = await dialog.showMessageBox({
    type: 'warning',
    title: 'Screen Recording Permission Required',
    message: 'Screen Memory needs screen recording permission to capture screenshots.',
    detail:
      'Please go to System Settings > Privacy & Security > Screen Recording and enable Screen Memory.',
    buttons: ['Open System Settings', 'Cancel'],
    defaultId: 0
  })

  if (result.response === 0) {
    shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
    )
  }
}

export function registerCaptureHandlers(ctx: Ctx): void {
  registerHandler(IPC.capture.start, null, async () => {
    if (hasScreenRecordingPermission()) {
      ctx.capture.start()
      ctx.onStatusChange()
    } else {
      await promptForScreenRecordingPermission()
    }
  })

  registerHandler(IPC.capture.stop, null, () => {
    ctx.capture.stop()
    ctx.onStatusChange()
  })

  registerHandler(IPC.capture.getStatus, null, () => ctx.capture.isRunning())
}
