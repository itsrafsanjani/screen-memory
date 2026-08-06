import { powerMonitor } from 'electron'
import { AppStateService } from './app-state-service'
import { IdleDetector } from './idle-detector'
import { openSegment, touchSegment } from './db/repositories/app-usage'
import { USAGE_POLL_INTERVAL_MS } from '../shared/constants'

interface OpenSegment {
  id: number
  bundleId: string
}

/**
 * Records which app is frontmost over time. Runs independently of
 * CaptureService: pausing recording stops screenshots, not time tracking.
 * Idle stretches are not attributed to any app.
 */
export class UsageService {
  private appState: AppStateService
  private idleDetector = new IdleDetector()
  private timer: ReturnType<typeof setInterval> | null = null
  private ticking = false
  private current: OpenSegment | null = null

  constructor(appState: AppStateService) {
    this.appState = appState
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      void this.tick()
    }, USAGE_POLL_INTERVAL_MS)

    // The machine going to sleep or locking ends the segment where it stands;
    // without this the next tick after waking would stretch it across the gap.
    powerMonitor.on('suspend', this.closeSegment)
    powerMonitor.on('lock-screen', this.closeSegment)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    powerMonitor.off('suspend', this.closeSegment)
    powerMonitor.off('lock-screen', this.closeSegment)
    this.closeSegment()
  }

  /** Bound so it can be added to and removed from powerMonitor by identity. */
  private closeSegment = (): void => {
    if (!this.current) return
    touchSegment(this.current.id, Date.now())
    this.current = null
  }

  private async tick(): Promise<void> {
    // A slow helper must not queue up ticks behind itself.
    if (this.ticking) return
    this.ticking = true
    try {
      if (this.idleDetector.isIdle()) {
        this.closeSegment()
        return
      }

      const state = await this.appState.getState()
      const frontmost = state?.frontmost
      // Time spent in Screen Memory's own window isn't work the user did in
      // another app, so it closes the segment rather than extending it.
      if (!frontmost || frontmost.pid === process.pid) {
        this.closeSegment()
        return
      }

      const now = Date.now()
      if (this.current && this.current.bundleId === frontmost.bundleId) {
        touchSegment(this.current.id, now)
        return
      }

      this.closeSegment()
      this.current = {
        id: openSegment({
          bundleId: frontmost.bundleId,
          appName: frontmost.name,
          startedAt: now
        }),
        bundleId: frontmost.bundleId
      }
    } catch (e) {
      console.error('Usage tracking tick failed:', e)
    } finally {
      this.ticking = false
    }
  }
}
