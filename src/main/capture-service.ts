import { desktopCapturer, screen } from 'electron'
import { StorageService } from './storage-service'
import { AppStateService } from './app-state-service'
import { IdleDetector } from './idle-detector'
import { insertScreenshot } from './db/repositories/screenshots'
import {
  DEFAULT_ACTIVE_INTERVAL_MS,
  DEFAULT_EXCLUSION_COVERAGE_PERCENT,
  DEFAULT_IDLE_INTERVAL_MS,
  DEFAULT_JPEG_QUALITY
} from '../shared/constants'
import type { DisplayWindow, ExcludedApp } from '../shared/types'

export class CaptureService {
  private timer: ReturnType<typeof setTimeout> | null = null
  private running = false
  private storage: StorageService
  private appState: AppStateService
  private idleDetector: IdleDetector
  private onStatusChanged?: (running: boolean) => void
  private onScreenshotCaptured?: (job: {
    screenshotId: number
    absolutePath: string
    timestamp: number
    displayId: string
    isIdle: boolean
  }) => void

  private activeIntervalMs = DEFAULT_ACTIVE_INTERVAL_MS
  private idleIntervalMs = DEFAULT_IDLE_INTERVAL_MS
  private jpegQuality = DEFAULT_JPEG_QUALITY

  private excludedBundleIds = new Set<string>()
  private exclusionThresholdPercent = DEFAULT_EXCLUSION_COVERAGE_PERCENT
  private skippedDisplayIds = new Set<string>()
  private warnedDisplayIdMismatch = false
  private exclusionBlind = false

  constructor(storage: StorageService, appState: AppStateService) {
    this.storage = storage
    this.appState = appState
    this.idleDetector = new IdleDetector()
  }

  setStatusCallback(cb: (running: boolean) => void): void {
    this.onStatusChanged = cb
  }

  setCaptureCallback(
    cb: (job: {
      screenshotId: number
      absolutePath: string
      timestamp: number
      displayId: string
      isIdle: boolean
    }) => void
  ): void {
    this.onScreenshotCaptured = cb
  }

  updateIntervals(activeMs?: number, idleMs?: number, quality?: number): void {
    if (activeMs !== undefined) this.activeIntervalMs = activeMs
    if (idleMs !== undefined) this.idleIntervalMs = idleMs
    if (quality !== undefined) this.jpegQuality = quality
  }

  setExclusion(apps: ExcludedApp[], thresholdPercent?: number): void {
    this.excludedBundleIds = new Set(apps.map((a) => a.bundleId))
    if (thresholdPercent !== undefined && Number.isFinite(thresholdPercent)) {
      this.exclusionThresholdPercent = Math.min(100, Math.max(1, thresholdPercent))
    }
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.onStatusChanged?.(true)
    this.scheduleNext()
  }

  stop(): void {
    this.running = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.onStatusChanged?.(false)
  }

  isRunning(): boolean {
    return this.running
  }

  private scheduleNext(): void {
    if (!this.running) return
    const idle = this.idleDetector.isIdle()
    const interval = idle ? this.idleIntervalMs : this.activeIntervalMs
    this.timer = setTimeout(async () => {
      await this.capture()
      this.scheduleNext()
    }, interval)
  }

  private async capture(): Promise<void> {
    try {
      const idle = this.idleDetector.isIdle()
      const displays = screen.getAllDisplays()

      const before = await this.getFrontWindows(displays.map((d) => d.id.toString()))
      if (before === null) {
        this.skipBlindCapture()
        return
      }

      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1920, height: 1080 }
      })

      const timestamp = Date.now()

      const targets = sources.map((source) => {
        const display = displays.find((d) => d.id.toString() === source.display_id)
        return { source, displayId: source.display_id || display?.id.toString() || 'unknown' }
      })
      const after = await this.getFrontWindows(
        targets.map((t) => t.displayId),
        0
      )
      if (after === null) {
        this.skipBlindCapture()
        return
      }
      this.exclusionBlind = false

      for (const { source, displayId } of targets) {
        if (this.shouldSkipDisplay(displayId, [before.get(displayId), after.get(displayId)])) {
          continue
        }

        const thumbnail = source.thumbnail
        if (thumbnail.isEmpty()) continue

        const jpegBuffer = thumbnail.toJPEG(this.jpegQuality)
        const width = thumbnail.getSize().width
        const height = thumbnail.getSize().height

        const relativePath = this.storage.saveImage(timestamp, displayId, jpegBuffer)

        const screenshotId = insertScreenshot({
          timestamp,
          display_id: displayId,
          file_path: relativePath,
          width,
          height,
          file_size: jpegBuffer.length,
          is_idle: idle
        })

        if (!idle && this.onScreenshotCaptured) {
          const absolutePath = this.storage.getAbsolutePath(relativePath)
          this.onScreenshotCaptured({
            screenshotId,
            absolutePath,
            timestamp,
            displayId,
            isIdle: idle
          })
        }
      }
    } catch (err) {
      console.error('Capture failed:', err)
    }
  }

  private async getFrontWindows(
    displayIds: string[],
    maxAgeMs?: number
  ): Promise<Map<string, DisplayWindow> | null> {
    if (this.excludedBundleIds.size === 0) return new Map()

    const state = await this.appState.getState(maxAgeMs)
    if (!state || state.displays.length === 0) return null

    const byId = new Map(state.displays.map((d) => [d.displayId, d]))
    if (displayIds.every((id) => byId.has(id))) return byId

    if (!this.warnedDisplayIdMismatch) {
      this.warnedDisplayIdMismatch = true
      console.warn(
        'App state helper reported unknown display ids:',
        [...byId.keys()].join(', '),
        '- capture sources are:',
        displayIds.join(', ')
      )
    }
    return null
  }

  private skipBlindCapture(): void {
    if (this.exclusionBlind) return
    this.exclusionBlind = true
    console.warn(
      'Skipping capture: the app state helper did not report the frontmost window, ' +
        'so an excluded app cannot be ruled out.'
    )
  }

  private isExcluded(front: DisplayWindow | undefined): boolean {
    return (
      !!front?.bundleId &&
      this.excludedBundleIds.has(front.bundleId) &&
      (front.coverage ?? 0) * 100 >= this.exclusionThresholdPercent
    )
  }

  private shouldSkipDisplay(displayId: string, fronts: Array<DisplayWindow | undefined>): boolean {
    const trigger = fronts.find((front) => this.isExcluded(front))

    if ((trigger !== undefined) !== this.skippedDisplayIds.has(displayId)) {
      if (trigger) {
        this.skippedDisplayIds.add(displayId)
        console.log(
          `Skipping display ${displayId}: ${trigger.name ?? trigger.bundleId} covers ` +
            `${Math.round((trigger.coverage ?? 0) * 100)}% of it`
        )
      } else {
        this.skippedDisplayIds.delete(displayId)
        console.log(`Resuming capture on display ${displayId}`)
      }
    }

    return trigger !== undefined
  }
}
