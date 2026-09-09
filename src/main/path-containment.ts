import { existsSync, realpathSync } from 'fs'
import { isAbsolute, resolve, sep } from 'path'

export function resolveInsideRoot(rootDir: string, relativePath: string): string | null {
  if (!relativePath || relativePath.includes('\0')) return null
  if (isAbsolute(relativePath)) return null

  const root = resolve(rootDir)
  const absolute = resolve(root, relativePath)
  if (absolute !== root && !absolute.startsWith(root + sep)) return null

  return absolute
}

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
