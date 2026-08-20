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

// The renderer never needs any of these; capture goes through the Swift helpers
// and the screencapture APIs in the main process instead. Anything not listed
// (clipboard, for one — copy would break without it) is left allowed.
const DENIED_PERMISSIONS = new Set<string>([
  'media',
  'geolocation',
  'notifications',
  'camera',
  'microphone',
  'display-capture'
])

export function registerSessionSecurity(): void {
  const defaultSession = session.defaultSession

  defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(!DENIED_PERMISSIONS.has(permission))
  })

  defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    return !DENIED_PERMISSIONS.has(permission)
  })

  // Dev only serves the renderer over Vite, whose HMR client needs a websocket
  // and inline eval that this policy forbids, so the header is packaged-only.
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

    // Compiled main lives in out/main, the renderer bundle in out/renderer.
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

    // Nothing in the renderer should open a window, and refusing to hand the URL
    // to openExternal keeps a compromised renderer from launching arbitrary
    // schemes through the shell.
    contents.setWindowOpenHandler(() => ({ action: 'deny' }))

    if (app.isPackaged) {
      contents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown') return

        const key = input.key.toLowerCase()
        const isDevTools =
          key === 'f12' ||
          ((input.control || input.meta) && key === 'r') ||
          (input.control && input.shift && (key === 'i' || key === 'j')) ||
          (input.meta && input.alt && (key === 'i' || key === 'j'))

        if (isDevTools) {
          event.preventDefault()
        }
      })
    }
  })
}
