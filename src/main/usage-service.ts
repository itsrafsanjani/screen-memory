import { powerMonitor } from 'electron'
import { AppStateService } from './app-state-service'
import { IdleDetector } from './idle-detector'
import { openSegment, touchSegment } from './db/repositories/app-usage'
import {
  IDLE_THRESHOLD_SECONDS,
  MAX_SEGMENT_SPAN_MS,
  USAGE_POLL_INTERVAL_MS
} from '../shared/constants'

interface OpenSegment {
  id: number
  bundleId: string
  startedAt: number
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
    powerMonitor.on('suspend', this.onPowerEvent)
    powerMonitor.on('lock-screen', this.onPowerEvent)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    powerMonitor.off('suspend', this.onPowerEvent)
    powerMonitor.off('lock-screen', this.onPowerEvent)
    this.closeSegment()
  }

  /** Bound so it can be added to and removed from powerMonitor by identity. */
  private onPowerEvent = (): void => {
    this.closeSegment()
  }

  /**
   * Ends the open segment. `endedAt` never runs behind the segment's own start:
   * an app that came forward inside an already-idle stretch would otherwise be
   * closed before it opened.
   */
  private closeSegment(endedAt: number = Date.now()): void {
    if (!this.current) return
    touchSegment(this.current.id, Math.max(this.current.startedAt, endedAt))
    this.current = null
  }

  private async tick(): Promise<void> {
    // A slow helper must not queue up ticks behind itself.
    if (this.ticking) return
    this.ticking = true
    try {
      const idleSeconds = this.idleDetector.getIdleSeconds()
      if (idleSeconds > IDLE_THRESHOLD_SECONDS) {
        // The user stopped working when the idle clock started, not when this
        // tick noticed. Closing at `now` would credit the app with the whole
        // idle threshold — two minutes per idle stretch, every time.
        this.closeSegment(Date.now() - idleSeconds * 1000)
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
      if (
        this.current &&
        this.current.bundleId === frontmost.bundleId &&
        // Day queries only look back MAX_SEGMENT_SPAN_MS for a segment that
        // might overlap them, so one allowed to run longer would vanish from
        // every day it covers but the first. Rolling over keeps that bound true
        // however long the machine is driven without an idle stretch.
        now - this.current.startedAt < MAX_SEGMENT_SPAN_MS
      ) {
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
        bundleId: frontmost.bundleId,
        startedAt: now
      }
    } catch (e) {
      console.error('Usage tracking tick failed:', e)
    } finally {
      this.ticking = false
    }
  }
}
