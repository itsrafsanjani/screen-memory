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

  private onPowerEvent = (): void => {
    this.closeSegment()
  }

  private closeSegment(endedAt: number = Date.now()): void {
    if (!this.current) return
    touchSegment(this.current.id, Math.max(this.current.startedAt, endedAt))
    this.current = null
  }

  private async tick(): Promise<void> {
    if (this.ticking) return
    this.ticking = true
    try {
      const idleSeconds = this.idleDetector.getIdleSeconds()
      if (idleSeconds > IDLE_THRESHOLD_SECONDS) {
        this.closeSegment(Date.now() - idleSeconds * 1000)
        return
      }

      const state = await this.appState.getState()
      const frontmost = state?.frontmost
      if (!frontmost || frontmost.pid === process.pid) {
        this.closeSegment()
        return
      }

      const now = Date.now()
      if (
        this.current &&
        this.current.bundleId === frontmost.bundleId &&
        now - this.current.startedAt < MAX_SEGMENT_SPAN_MS
      ) {
        touchSegment(this.current.id, now)
        return
      }

      this.closeSegment(
        this.current ? Math.min(now, this.current.startedAt + MAX_SEGMENT_SPAN_MS) : now
      )
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
