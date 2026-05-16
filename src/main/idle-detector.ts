import { powerMonitor } from 'electron'
import { IDLE_THRESHOLD_SECONDS } from '../shared/constants'

export class IdleDetector {
  isIdle(): boolean {
    return powerMonitor.getSystemIdleTime() > IDLE_THRESHOLD_SECONDS
  }
}
