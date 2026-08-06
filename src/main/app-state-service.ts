import { spawn, type ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { z } from 'zod'
import type { AppState, RunningApp } from '../shared/types'
import {
  APP_STATE_CACHE_MS,
  APP_STATE_REQUEST_TIMEOUT_MS,
  APP_STATE_RESPAWN_BASE_DELAY_MS,
  APP_STATE_RESPAWN_MAX_DELAY_MS
} from '../shared/constants'

const appSchema = z.object({ bundleId: z.string(), name: z.string() })

const stateSchema = z.object({
  frontmost: z.object({ bundleId: z.string(), name: z.string(), pid: z.number() }).optional(),
  displays: z.array(
    z.object({
      displayId: z.string(),
      bundleId: z.string().optional(),
      name: z.string().optional(),
      coverage: z.number().optional(),
      isFullscreen: z.boolean().optional()
    })
  )
})

const appsSchema = z.object({ apps: z.array(appSchema) })

interface PendingRequest {
  command: string
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

/**
 * Wraps the `screen-memory-appstate` Swift helper, which answers one JSON line
 * per command read from stdin. The process is kept alive rather than spawned
 * per call because usage tracking polls every couple of seconds.
 *
 * macOS-only. Every method degrades to `null`/`[]` when the binary is missing,
 * so the rest of the app behaves as if exclusion and usage tracking are simply
 * turned off.
 */
export class AppStateService {
  private binaryPath: string
  private child: ChildProcess | null = null
  private started = false
  private stdoutBuffer = ''

  private queue: PendingRequest[] = []
  private inFlight: PendingRequest | null = null
  private requestTimer: ReturnType<typeof setTimeout> | null = null

  private respawnTimer: ReturnType<typeof setTimeout> | null = null
  private respawnDelayMs = APP_STATE_RESPAWN_BASE_DELAY_MS

  private cachedState: AppState | null = null
  private cachedStateAt = 0
  private inFlightState: Promise<AppState | null> | null = null

  constructor() {
    this.binaryPath = this.resolveBinaryPath()
  }

  /** Mirrors OcrService.resolveBinaryPath — same layout, different executable. */
  private resolveBinaryPath(): string {
    if (app.isPackaged) {
      return join(process.resourcesPath, 'bin', 'screen-memory-appstate')
    }
    const appPath = app.getAppPath()
    const directPath = join(appPath, 'swift-ocr', '.build', 'release', 'screen-memory-appstate')
    if (existsSync(directPath)) return directPath
    return join(appPath, '..', '..', 'swift-ocr', '.build', 'release', 'screen-memory-appstate')
  }

  isAvailable(): boolean {
    return process.platform === 'darwin' && existsSync(this.binaryPath)
  }

  start(): void {
    if (this.started) return
    this.started = true
    if (!this.isAvailable()) {
      console.warn(
        'App state helper not found at',
        this.binaryPath,
        '- exclusion and usage tracking are disabled'
      )
      return
    }
    this.spawnChild()
  }

  stop(): void {
    this.started = false
    if (this.respawnTimer) {
      clearTimeout(this.respawnTimer)
      this.respawnTimer = null
    }
    this.killChild()
    this.failPending(new Error('App state helper stopped'))
  }

  /**
   * Memoized for APP_STATE_CACHE_MS. Concurrent callers within the window share
   * one round-trip; on any failure the caller gets null rather than a rejection.
   */
  async getState(): Promise<AppState | null> {
    const now = Date.now()
    if (this.cachedState && now - this.cachedStateAt < APP_STATE_CACHE_MS) {
      return this.cachedState
    }
    if (this.inFlightState) return this.inFlightState

    this.inFlightState = this.request('state')
      .then((raw) => {
        const parsed = stateSchema.safeParse(raw)
        if (!parsed.success) return null
        this.cachedState = parsed.data
        this.cachedStateAt = Date.now()
        return this.cachedState
      })
      .catch(() => null)
      .finally(() => {
        this.inFlightState = null
      })

    return this.inFlightState
  }

  async listRunningApps(): Promise<RunningApp[]> {
    try {
      const parsed = appsSchema.safeParse(await this.request('apps'))
      return parsed.success ? parsed.data.apps : []
    } catch {
      return []
    }
  }

  /** Reads the bundle id and display name of an `.app` on disk. */
  async readAppBundle(path: string): Promise<RunningApp | null> {
    // The protocol is line-based, so a newline in the path would be read as a
    // second command.
    if (path.includes('\n') || path.includes('\r')) return null
    try {
      const parsed = appSchema.safeParse(await this.request(`bundle ${path}`))
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }

  private request(command: string): Promise<unknown> {
    if (!this.isAvailable()) {
      return Promise.reject(new Error('App state helper is unavailable'))
    }
    return new Promise<unknown>((resolve, reject) => {
      this.queue.push({ command, resolve, reject })
      this.pump()
    })
  }

  private pump(): void {
    if (this.inFlight || this.queue.length === 0) return

    if (!this.child) {
      if (!this.started) this.started = true
      this.spawnChild()
      if (!this.child) {
        this.failPending(new Error('App state helper could not be started'))
        return
      }
    }

    const next = this.queue.shift()!
    this.inFlight = next

    this.requestTimer = setTimeout(() => {
      // A late reply would be matched against the *next* request, so the only
      // safe recovery is to restart the helper.
      const pending = this.inFlight
      this.inFlight = null
      this.requestTimer = null
      pending?.reject(new Error(`App state helper timed out on "${pending.command}"`))
      this.killChild()
      this.scheduleRespawn()
    }, APP_STATE_REQUEST_TIMEOUT_MS)

    this.child.stdin?.write(`${next.command}\n`)
  }

  private spawnChild(): void {
    if (this.child || !this.isAvailable()) return

    try {
      this.child = spawn(this.binaryPath, [], { stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (e) {
      console.error('Failed to spawn app state helper:', e)
      this.child = null
      this.scheduleRespawn()
      return
    }

    this.stdoutBuffer = ''

    this.child.stdout?.setEncoding('utf8')
    this.child.stdout?.on('data', (chunk: string) => this.onStdout(chunk))
    this.child.stderr?.setEncoding('utf8')
    this.child.stderr?.on('data', (chunk: string) => {
      const text = chunk.trim()
      if (text) console.error('App state helper:', text)
    })
    this.child.on('error', (e) => console.error('App state helper error:', e))
    this.child.on('exit', () => this.onExit())
  }

  private onStdout(chunk: string): void {
    this.stdoutBuffer += chunk
    let newline = this.stdoutBuffer.indexOf('\n')
    while (newline !== -1) {
      const line = this.stdoutBuffer.slice(0, newline).trim()
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1)
      if (line) this.settle(line)
      newline = this.stdoutBuffer.indexOf('\n')
    }
  }

  private settle(line: string): void {
    const pending = this.inFlight
    // A line with nothing waiting on it means the protocol desynced; drop it
    // rather than handing it to whichever request comes next.
    if (!pending) return

    this.inFlight = null
    if (this.requestTimer) {
      clearTimeout(this.requestTimer)
      this.requestTimer = null
    }

    // The helper answered, so it is healthy again.
    this.respawnDelayMs = APP_STATE_RESPAWN_BASE_DELAY_MS

    try {
      const payload = JSON.parse(line) as unknown
      if (payload && typeof payload === 'object' && 'error' in payload) {
        pending.reject(new Error(String((payload as { error: unknown }).error)))
      } else {
        pending.resolve(payload)
      }
    } catch {
      pending.reject(new Error('App state helper returned malformed JSON'))
    }

    this.pump()
  }

  private onExit(): void {
    this.child = null
    this.failPending(new Error('App state helper exited'))
    if (this.started) this.scheduleRespawn()
  }

  private killChild(): void {
    if (!this.child) return
    const child = this.child
    this.child = null
    child.removeAllListeners('exit')
    child.kill()
  }

  private scheduleRespawn(): void {
    if (!this.started || this.respawnTimer) return
    const delay = this.respawnDelayMs
    this.respawnDelayMs = Math.min(delay * 2, APP_STATE_RESPAWN_MAX_DELAY_MS)
    this.respawnTimer = setTimeout(() => {
      this.respawnTimer = null
      this.spawnChild()
      this.pump()
    }, delay)
  }

  private failPending(error: Error): void {
    if (this.requestTimer) {
      clearTimeout(this.requestTimer)
      this.requestTimer = null
    }
    const pending = this.inFlight
    this.inFlight = null
    pending?.reject(error)

    const queued = this.queue
    this.queue = []
    for (const request of queued) request.reject(error)
  }
}
