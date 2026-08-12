import { spawn, type ChildProcess } from 'child_process'
import { accessSync, constants, existsSync } from 'fs'
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
  private available: boolean | null = null
  private stdoutBuffer = ''

  private queue: PendingRequest[] = []
  private inFlight: PendingRequest | null = null
  private requestTimer: ReturnType<typeof setTimeout> | null = null

  private respawnTimer: ReturnType<typeof setTimeout> | null = null
  private respawnDelayMs = APP_STATE_RESPAWN_BASE_DELAY_MS

  private cachedState: AppState | null = null
  private cachedStateAt = 0
  private inFlightState: Promise<AppState | null> | null = null
  private inFlightStartedAt = 0

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
    if (this.available !== null) return this.available
    if (process.platform !== 'darwin') {
      this.available = false
      return false
    }
    try {
      // Existence alone isn't enough. A helper that lost its executable bit —
      // a half-finished build, a copy through a filesystem that drops modes —
      // fails inside spawn asynchronously, which surfaces as every request
      // timing out instead of the clean "feature is off" path.
      accessSync(this.binaryPath, constants.X_OK)
      this.available = true
    } catch {
      this.available = false
    }
    return this.available
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
   *
   * `maxAgeMs` lets a caller that must see the world *now* opt out of the cache
   * — capture re-reads after grabbing pixels, and a cached answer from before
   * the grab would defeat the point of asking twice.
   */
  async getState(maxAgeMs: number = APP_STATE_CACHE_MS): Promise<AppState | null> {
    const now = Date.now()
    if (this.cachedState && now - this.cachedStateAt < maxAgeMs) {
      return this.cachedState
    }
    // Sharing a request already in flight is the same staleness as sharing the
    // cache, so it has to answer to the same age limit: a caller passing 0 would
    // otherwise be handed a round-trip that started before whatever it is trying
    // to observe.
    if (this.inFlightState && this.inFlightStartedAt >= now - maxAgeMs) {
      return this.inFlightState
    }

    const pending: Promise<AppState | null> = this.request('state')
      .then((raw) => {
        const parsed = stateSchema.safeParse(raw)
        if (!parsed.success) return null
        this.cachedState = parsed.data
        this.cachedStateAt = Date.now()
        return this.cachedState
      })
      .catch(() => null)
      .finally(() => {
        // Only if it is still the current one: a fresher request may have
        // replaced it, and clearing that would let the next caller start a
        // third.
        if (this.inFlightState === pending) this.inFlightState = null
      })

    this.inFlightState = pending
    this.inFlightStartedAt = now
    return pending
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

    // A request that arrives after stop() used to restart the helper, which at
    // quit meant spawning a process moments before the app went away.
    if (!this.started) {
      this.failPending(new Error('App state helper is not running'))
      return
    }

    if (!this.child) {
      // Spawning here regardless would defeat the backoff: against a helper
      // that crashes on startup, the 2s usage poll would restart it forever.
      // Callers all degrade to null/[], so failing now beats holding them for
      // the length of the backoff.
      if (this.respawnTimer) {
        this.failPending(new Error('App state helper is restarting'))
        return
      }
      this.spawnChild()
      if (!this.child) {
        this.failPending(new Error('App state helper could not be started'))
        return
      }
    }

    const stdin = this.child.stdin
    if (!stdin || !stdin.writable) {
      this.handleChildFailure(new Error('App state helper stdin is closed'))
      return
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
      // Every other failure path drains the queue through failPending(); this
      // one used to leave it sitting until the respawn fired. Capture awaits its
      // second read before it can schedule the next cycle, so against a wedged
      // helper that stall is the whole backoff — up to 30s of no screenshots at
      // all. pump() sees the respawn timer and rejects them now instead.
      this.pump()
    }, APP_STATE_REQUEST_TIMEOUT_MS)

    stdin.write(`${next.command}\n`, (err) => {
      if (err) this.handleChildFailure(err)
    })
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

    // Every pipe needs its own listener. An 'error' with nothing listening is
    // rethrown by Node and takes the main process down with it — and a write to
    // a helper that died a moment ago raises exactly that as EPIPE on stdin.
    for (const pipe of [this.child.stdin, this.child.stdout, this.child.stderr]) {
      pipe?.on('error', (e: Error) => this.handleChildFailure(e))
    }

    this.child.on('error', (e) => this.handleChildFailure(e))
    // 'close' rather than 'exit': when spawn itself fails — a binary that isn't
    // executable or isn't a valid Mach-O — the process never runs, so 'exit'
    // never fires and the dead child would be held forever.
    this.child.on('close', () => this.onExit())
  }

  /**
   * Any failure on the pipe leaves the helper's state unknowable: a partly
   * written command would desync every reply after it. Tearing the process down
   * and letting the backoff bring it back is the only safe recovery.
   */
  private handleChildFailure(error: Error): void {
    console.error('App state helper error:', error)
    this.killChild()
    this.failPending(error)
    if (this.started) this.scheduleRespawn()
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
    this.handleChildFailure(new Error('App state helper exited'))
  }

  private killChild(): void {
    if (!this.child) return
    const child = this.child
    this.child = null
    // Detach before killing. Left attached, this child's teardown would run
    // handleChildFailure against whatever request the *next* child is already
    // serving, and a line still buffered in its stdout would settle it.
    child.removeAllListeners('close')
    child.removeAllListeners('error')
    child.stdout?.removeAllListeners('data')
    // Swallowed rather than dropped: killing a process raises EPIPE on its
    // pipes, and an 'error' with no listener is fatal in Node.
    child.on('error', () => {})
    for (const pipe of [child.stdin, child.stdout, child.stderr]) {
      pipe?.removeAllListeners('error')
      pipe?.on('error', () => {})
    }
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
