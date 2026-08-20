import { powerMonitor } from 'electron'
import { IDLE_THRESHOLD_SECONDS } from '../shared/constants'

export class IdleDetector {
  /** Seconds since the last input event. */
  getIdleSeconds(): number {
    return powerMonitor.getSystemIdleTime()
  }

  isIdle(): boolean {
    return this.getIdleSeconds() > IDLE_THRESHOLD_SECONDS
  }
}
