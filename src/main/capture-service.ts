import { desktopCapturer, screen } from 'electron'
import { StorageService } from './storage-service'
import { IdleDetector } from './idle-detector'
import { insertScreenshot } from './db/repositories/screenshots'
import {
  DEFAULT_ACTIVE_INTERVAL_MS,
  DEFAULT_IDLE_INTERVAL_MS,
  DEFAULT_JPEG_QUALITY
} from '../shared/constants'

export class CaptureService {
  private timer: ReturnType<typeof setTimeout> | null = null
  private running = false
  private storage: StorageService
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

  constructor(storage: StorageService) {
    this.storage = storage
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
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 1920, height: 1080 }
      })

      const timestamp = Date.now()

      for (const source of sources) {
        const display = displays.find((d) => d.id.toString() === source.display_id)
        const thumbnail = source.thumbnail
        if (thumbnail.isEmpty()) continue

        const jpegBuffer = thumbnail.toJPEG(this.jpegQuality)
        const width = thumbnail.getSize().width
        const height = thumbnail.getSize().height
        const displayId = source.display_id || display?.id.toString() || 'unknown'

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
}
