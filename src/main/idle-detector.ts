import { powerMonitor } from 'electron'

const IDLE_THRESHOLD_SECONDS = 120

export class IdleDetector {
  isIdle(): boolean {
    return powerMonitor.getSystemIdleTime() > IDLE_THRESHOLD_SECONDS
  }
}
