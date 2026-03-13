import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { DatabaseService } from './database-service'

interface OcrJob {
  screenshotId: number
  imagePath: string
}

export class OcrService {
  private db: DatabaseService
  private queue: OcrJob[] = []
  private processing = false
  private binaryPath: string

  constructor(db: DatabaseService) {
    this.db = db
    this.binaryPath = this.resolveBinaryPath()
  }

  private resolveBinaryPath(): string {
    // In production, the binary is bundled as an extra resource
    if (app.isPackaged) {
      return join(process.resourcesPath, 'bin', 'screen-memory-ocr')
    }
    // In development, use the swift build output relative to project root
    // app.getAppPath() in dev points to project root, in built mode to out/main
    const appPath = app.getAppPath()
    // Try project root directly first
    const directPath = join(appPath, 'swift-ocr', '.build', 'release', 'screen-memory-ocr')
    if (existsSync(directPath)) return directPath
    // Fallback: if appPath is out/main, go up two levels
    return join(appPath, '..', '..', 'swift-ocr', '.build', 'release', 'screen-memory-ocr')
  }

  isAvailable(): boolean {
    return existsSync(this.binaryPath)
  }

  enqueue(screenshotId: number, absolutePath: string): void {
    this.queue.push({ screenshotId, imagePath: absolutePath })
    this.processNext()
  }

  private async processNext(): Promise<void> {
    if (this.processing || this.queue.length === 0) return

    this.processing = true
    const job = this.queue.shift()!

    try {
      const result = await this.runOcr(job.imagePath)
      if (result && result.text.trim().length > 0) {
        this.db.insertOcrResult(job.screenshotId, result.text, result.confidence)
      }
    } catch (err) {
      console.error(`OCR failed for screenshot ${job.screenshotId}:`, err)
    }

    this.processing = false
    this.processNext()
  }

  private runOcr(imagePath: string): Promise<{ text: string; confidence: number } | null> {
    return new Promise((resolve) => {
      execFile(
        this.binaryPath,
        [imagePath],
        { timeout: 10000, maxBuffer: 1024 * 1024 },
        (err, stdout) => {
          if (err) {
            resolve(null)
            return
          }
          try {
            const result = JSON.parse(stdout.trim())
            resolve({ text: result.text || '', confidence: result.confidence || 0 })
          } catch {
            resolve(null)
          }
        }
      )
    })
  }
}
