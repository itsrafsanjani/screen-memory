import { desktopCapturer, screen } from 'electron'
import { StorageService } from './storage-service'
import { AppStateService } from './app-state-service'
import { IdleDetector } from './idle-detector'
import { insertScreenshot } from './db/repositories/screenshots'
import {
  DEFAULT_ACTIVE_INTERVAL_MS,
  DEFAULT_EXCLUSION_COVERAGE_PERCENT,
  DEFAULT_IDLE_INTERVAL_MS,
  DEFAULT_JPEG_QUALITY,
  MAX_CAPTURE_INTERVAL_MS,
  MAX_JPEG_QUALITY,
  MIN_CAPTURE_INTERVAL_MS,
  MIN_JPEG_QUALITY
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
  /** Display ids currently being skipped, so the log fires on transitions only. */
  private skippedDisplayIds = new Set<string>()
  private warnedDisplayIdMismatch = false
  // Latched so a helper that stays down logs once rather than every cycle, and
  // logs again if it recovers and fails a second time.
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
    if (activeMs !== undefined) {
      this.activeIntervalMs = Math.min(
        MAX_CAPTURE_INTERVAL_MS,
        Math.max(MIN_CAPTURE_INTERVAL_MS, activeMs)
      )
    }
    if (idleMs !== undefined) {
      this.idleIntervalMs = Math.min(
        MAX_CAPTURE_INTERVAL_MS,
        Math.max(MIN_CAPTURE_INTERVAL_MS, idleMs)
      )
    }
    if (quality !== undefined) {
      this.jpegQuality = Math.min(MAX_JPEG_QUALITY, Math.max(MIN_JPEG_QUALITY, quality))
    }
  }

  /**
   * Apps to keep out of screenshots, and how much of a display one of them has
   * to cover before that display is skipped. The threshold lives here rather
   * than in the native helper so it stays adjustable without a rebuild.
   */
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

      // getSources() grabs the pixels somewhere inside its own await, so a
      // single check can always be on the wrong side of it: check only before
      // and an app that comes forward during the grab lands in the archive;
      // check only after and one that was excluded at grab time is captured
      // because it has since been dismissed. Both reads have to agree that the
      // display is clear.
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
        // Freshness is the whole point of the second read, so it bypasses the
        // memo the first one just filled.
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

  /**
   * The frontmost window on each display, keyed by the display id used by
   * `desktopCapturer`. Empty when nothing is excluded, so the common case never
   * pays for a helper round-trip.
   *
   * `null` means the question could not be answered while exclusions are
   * configured — distinct from an empty map, which means nothing is excluded.
   * Collapsing the two is what let a timed-out helper look like a clear screen.
   */
  private async getFrontWindows(
    displayIds: string[],
    maxAgeMs?: number
  ): Promise<Map<string, DisplayWindow> | null> {
    if (this.excludedBundleIds.size === 0) return new Map()

    const state = await this.appState.getState(maxAgeMs)
    if (!state || state.displays.length === 0) return null

    const byId = new Map(state.displays.map((d) => [d.displayId, d]))
    if (displayIds.some((id) => byId.has(id))) return byId

    // Electron's macOS Display.id is the CGDirectDisplayID the helper reports,
    // so this should not happen — but if it ever does, a single display can
    // still be matched unambiguously.
    if (!this.warnedDisplayIdMismatch) {
      this.warnedDisplayIdMismatch = true
      console.warn(
        'App state helper reported unknown display ids:',
        [...byId.keys()].join(', '),
        '- capture sources are:',
        displayIds.join(', ')
      )
    }
    if (displayIds.length === 1 && state.displays.length === 1) {
      return new Map([[displayIds[0], state.displays[0]]])
    }
    return null
  }

  /**
   * Once an app is excluded, knowing what is in front is a precondition for
   * capturing at all, so an unanswerable read has to skip the cycle. A gap in
   * the archive is recoverable; a full-resolution JPEG of the app the user
   * asked never to record — written to disk and handed to OCR — is not.
   */
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

  /** Skips the display if *any* of the reads around the grab saw an excluded app. */
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
