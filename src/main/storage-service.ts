import { app } from 'electron'
import { join, dirname } from 'path'
import { mkdirSync, writeFileSync, existsSync, rmSync, rmdirSync, readdirSync, statSync } from 'fs'
import { format } from 'date-fns'
import { MS_PER_DAY } from '../shared/constants'

export class StorageService {
  private basePath: string

  constructor() {
    this.basePath = join(app.getPath('userData'), 'screenshots')
    mkdirSync(this.basePath, { recursive: true })
  }

  saveImage(timestamp: number, displayId: string, jpegBuffer: Buffer): string {
    const date = new Date(timestamp)
    const dateDir = format(date, 'yyyy-MM-dd')
    const timeStr = format(date, 'HH-mm-ss')
    const relativePath = join(dateDir, `${timeStr}-${displayId}.jpg`)
    const fullDir = join(this.basePath, dateDir)
    mkdirSync(fullDir, { recursive: true })
    writeFileSync(join(this.basePath, relativePath), jpegBuffer)
    return relativePath
  }

  getAbsolutePath(relativePath: string): string {
    return join(this.basePath, relativePath)
  }

  getBasePath(): string {
    return this.basePath
  }

  getStorageUsage(): number {
    if (!existsSync(this.basePath)) return 0
    let totalBytes = 0
    const walkDir = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const fullPath = join(dir, entry)
        const stat = statSync(fullPath)
        if (stat.isDirectory()) {
          walkDir(fullPath)
        } else {
          totalBytes += stat.size
        }
      }
    }
    walkDir(this.basePath)
    return totalBytes
  }

  deleteFiles(relativePaths: string[]): void {
    const dayDirs = new Set<string>()
    for (const relativePath of relativePaths) {
      try {
        rmSync(this.getAbsolutePath(relativePath), { force: true })
        dayDirs.add(dirname(this.getAbsolutePath(relativePath)))
      } catch (err) {
        console.error('Failed to delete screenshot file:', relativePath, err)
      }
    }
    // Prune day folders that are now empty
    for (const dir of dayDirs) {
      try {
        if (existsSync(dir) && dir !== this.basePath && readdirSync(dir).length === 0) {
          rmdirSync(dir)
        }
      } catch (err) {
        console.error('Failed to prune empty screenshot dir:', dir, err)
      }
    }
  }

  cleanupOldData(retentionDays: number): string[] {
    const cutoff = Date.now() - retentionDays * MS_PER_DAY
    const cutoffDate = format(new Date(cutoff), 'yyyy-MM-dd')
    const removedDirs: string[] = []

    if (!existsSync(this.basePath)) return removedDirs

    for (const entry of readdirSync(this.basePath)) {
      const fullPath = join(this.basePath, entry)
      const stat = statSync(fullPath)
      if (stat.isDirectory() && entry < cutoffDate) {
        rmSync(fullPath, { recursive: true, force: true })
        removedDirs.push(entry)
      }
    }

    return removedDirs
  }
}
