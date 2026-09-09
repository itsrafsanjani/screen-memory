import { app, session } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join, resolve, sep } from 'path'
import { fileURLToPath } from 'url'

export const CSP_HEADER =
  "default-src 'self' screenmemory:; " +
  "script-src 'self'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: screenmemory:; " +
  "font-src 'self' data:; " +
  "connect-src 'self' screenmemory:; " +
  "object-src 'none'; " +
  "base-uri 'self'; " +
  "frame-ancestors 'none';"

const ALLOWED_PERMISSIONS = new Set<string>(['clipboard-sanitized-write'])

export function registerSessionSecurity(): void {
  const defaultSession = session.defaultSession

  defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission))
  })

  defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return ALLOWED_PERMISSIONS.has(permission)
  })

  if (app.isPackaged) {
    defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [CSP_HEADER]
        }
      })
    })
  }
}

function isAllowedRendererUrl(url: string): boolean {
  const devServerUrl = process.env['ELECTRON_RENDERER_URL']

  try {
    if (is.dev && devServerUrl) {
      return new URL(url).origin === new URL(devServerUrl).origin
    }

    const parsed = new URL(url)
    if (parsed.protocol !== 'file:') return false

    const rendererRoot = resolve(join(__dirname, '../renderer'))
    const target = resolve(fileURLToPath(parsed))
    return target === rendererRoot || target.startsWith(rendererRoot + sep)
  } catch {
    return false
  }
}

export function registerWebContentsGuards(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.on('will-navigate', (event, url) => {
      if (!isAllowedRendererUrl(url)) {
        event.preventDefault()
      }
    })

    contents.on('will-attach-webview', (event) => {
      event.preventDefault()
    })

    contents.setWindowOpenHandler(() => ({ action: 'deny' }))

    if (app.isPackaged) {
      contents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown') return

        const key = input.key.toLowerCase()
        if ((input.control || input.meta) && key === 'r') {
          event.preventDefault()
        }
      })
    }
  })
}
