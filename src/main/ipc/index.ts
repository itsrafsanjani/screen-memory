import type { CaptureService } from '../capture-service'
import type { StorageService } from '../storage-service'
import type { GitService } from '../git-service'
import type { AiService } from '../ai-service'
import { registerScreenshotHandlers } from './screenshots'
import { registerCaptureHandlers } from './capture'
import { registerThemeHandlers } from './theme'
import { registerSettingsHandlers } from './settings'
import { registerGitHandlers } from './git'
import { registerOcrHandlers } from './ocr'
import { registerAiHandlers } from './ai'
import { registerAppHandlers } from './app'

export interface IpcRegistryContext {
  capture: CaptureService
  storage: StorageService
  git: GitService
  ai: AiService
  onCaptureStatusChange: () => void
}

export function registerAllIpcHandlers(ctx: IpcRegistryContext): void {
  registerScreenshotHandlers()
  registerCaptureHandlers({ capture: ctx.capture, onStatusChange: ctx.onCaptureStatusChange })
  registerThemeHandlers()
  registerSettingsHandlers({ capture: ctx.capture, storage: ctx.storage })
  registerGitHandlers({ git: ctx.git })
  registerOcrHandlers()
  registerAiHandlers({ ai: ctx.ai })
  registerAppHandlers()
}
