import type { ScreenshotRecord } from '../../../types'

export function formatTime(timestampMs: number): string {
  const d = new Date(timestampMs)
  const h = d.getHours()
  const m = d.getMinutes().toString().padStart(2, '0')
  const s = d.getSeconds().toString().padStart(2, '0')
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${m}:${s} ${ampm}`
}

export function formatTimeShort(timestampMs: number): string {
  const d = new Date(timestampMs)
  const h = d.getHours()
  const m = d.getMinutes().toString().padStart(2, '0')
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${m} ${ampm}`
}

/** Whether a `YYYY-MM-DD` string names the same local day as `other`. */
function isSameDay(dateStr: string, other: Date): boolean {
  const [y, m, d] = dateStr.split('-').map(Number)
  return other.getFullYear() === y && other.getMonth() === m - 1 && other.getDate() === d
}

/**
 * Whether `dateStr` is today, in local time. Callers use it to decide whether a
 * day can still change: every earlier day is finished and never needs re-reading.
 */
export function isToday(dateStr: string): boolean {
  return isSameDay(dateStr, new Date())
}

export function formatDateDisplay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)

  if (isToday(dateStr)) return 'Today'
  if (isSameDay(dateStr, yesterday)) return 'Yesterday'
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export function findNearestScreenshot(
  screenshots: ScreenshotRecord[],
  targetTimestamp: number
): number {
  if (screenshots.length === 0) return -1

  let lo = 0
  let hi = screenshots.length - 1

  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (screenshots[mid].timestamp < targetTimestamp) {
      lo = mid + 1
    } else if (screenshots[mid].timestamp > targetTimestamp) {
      hi = mid - 1
    } else {
      return mid
    }
  }

  // lo is the insertion point; check neighbors
  if (lo >= screenshots.length) return screenshots.length - 1
  if (hi < 0) return 0

  const diffLo = Math.abs(screenshots[lo].timestamp - targetTimestamp)
  const diffHi = Math.abs(screenshots[hi].timestamp - targetTimestamp)
  return diffLo < diffHi ? lo : hi
}
