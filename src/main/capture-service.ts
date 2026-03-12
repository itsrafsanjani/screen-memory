import { desktopCapturer, screen } from 'electron'
import { DatabaseService } from './database-service'
import { StorageService } from './storage-service'
import { IdleDetector } from './idle-detector'

const ACTIVE_INTERVAL_MS = 5000
const IDLE_INTERVAL_MS = 30000

export class CaptureService {
  private timer: ReturnType<typeof setTimeout> | null = null
  private running = false
  private db: DatabaseService
  private storage: StorageService
  private idleDetector: IdleDetector
  private onStatusChanged?: (running: boolean) => void

  constructor(db: DatabaseService, storage: StorageService) {
    this.db = db
    this.storage = storage
    this.idleDetector = new IdleDetector()
  }

  setStatusCallback(cb: (running: boolean) => void): void {
    this.onStatusChanged = cb
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
    const interval = idle ? IDLE_INTERVAL_MS : ACTIVE_INTERVAL_MS
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

        const jpegBuffer = thumbnail.toJPEG(65)
        const width = thumbnail.getSize().width
        const height = thumbnail.getSize().height
        const displayId = source.display_id || display?.id.toString() || 'unknown'

        const relativePath = this.storage.saveImage(timestamp, displayId, jpegBuffer)

        this.db.insertScreenshot({
          timestamp,
          display_id: displayId,
          file_path: relativePath,
          width,
          height,
          file_size: jpegBuffer.length,
          is_idle: idle
        })
      }
    } catch (err) {
      console.error('Capture failed:', err)
    }
  }
}
