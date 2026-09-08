import { existsSync, realpathSync } from 'fs'
import { isAbsolute, resolve, sep } from 'path'

/**
 * Resolves a *relative* path against `rootDir`, returning an absolute path only
 * when it stays inside the root. Rejects empty paths, NUL bytes, absolute
 * inputs and `..` escapes, returning null instead.
 *
 * Absolute inputs are rejected before resolving: unlike `path.join`,
 * `path.resolve(root, '/etc/passwd')` discards the root entirely.
 */
export function resolveInsideRoot(rootDir: string, relativePath: string): string | null {
  if (!relativePath || relativePath.includes('\0')) return null
  if (isAbsolute(relativePath)) return null

  const root = resolve(rootDir)
  const absolute = resolve(root, relativePath)
  if (absolute !== root && !absolute.startsWith(root + sep)) return null

  return absolute
}

/**
 * Same as {@link resolveInsideRoot}, but also returns null when the file is
 * missing, or when a symlink inside the root resolves to a target outside it.
 */
export function resolveExistingFileInsideRoot(
  rootDir: string,
  relativePath: string
): string | null {
  const absolute = resolveInsideRoot(rootDir, relativePath)
  if (!absolute || !existsSync(absolute)) return null

  let realRoot: string
  let realTarget: string
  try {
    realRoot = realpathSync(rootDir)
    realTarget = realpathSync(absolute)
  } catch {
    return null
  }
  if (realTarget !== realRoot && !realTarget.startsWith(realRoot + sep)) return null

  return absolute
}
