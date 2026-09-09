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

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

const errorSchema = z.object({ error: z.unknown() })

interface PendingRequest {
  command: string
  resolve: (value: JsonValue) => void
  reject: (error: Error) => void
}

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

  async getState(maxAgeMs: number = APP_STATE_CACHE_MS): Promise<AppState | null> {
    const now = Date.now()
    if (this.cachedState && now - this.cachedStateAt < maxAgeMs) {
      return this.cachedState
    }
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

  async readAppBundle(path: string): Promise<RunningApp | null> {
    if (path.includes('\n') || path.includes('\r')) return null
    try {
      const parsed = appSchema.safeParse(await this.request(`bundle ${path}`))
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }

  private request(command: string): Promise<JsonValue> {
    if (!this.isAvailable()) {
      return Promise.reject(new Error('App state helper is unavailable'))
    }
    return new Promise<JsonValue>((resolve, reject) => {
      this.queue.push({ command, resolve, reject })
      this.pump()
    })
  }

  private pump(): void {
    if (this.inFlight || this.queue.length === 0) return

    if (!this.started) {
      this.failPending(new Error('App state helper is not running'))
      return
    }

    if (!this.child) {
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
      const pending = this.inFlight
      this.inFlight = null
      this.requestTimer = null
      pending?.reject(new Error(`App state helper timed out on "${pending.command}"`))
      this.killChild()
      this.scheduleRespawn()
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

    for (const pipe of [this.child.stdin, this.child.stdout, this.child.stderr]) {
      pipe?.on('error', (e: Error) => this.handleChildFailure(e))
    }

    this.child.on('error', (e) => this.handleChildFailure(e))
    this.child.on('close', () => this.onExit())
  }

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
    if (!pending) return

    this.inFlight = null
    if (this.requestTimer) {
      clearTimeout(this.requestTimer)
      this.requestTimer = null
    }

    this.respawnDelayMs = APP_STATE_RESPAWN_BASE_DELAY_MS

    try {
      const payload = JSON.parse(line)
      const failure = errorSchema.safeParse(payload)
      if (failure.success) {
        pending.reject(new Error(String(failure.data.error)))
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
    child.removeAllListeners('close')
    child.removeAllListeners('error')
    child.stdout?.removeAllListeners('data')
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
