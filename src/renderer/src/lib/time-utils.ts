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

export function formatDateDisplay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)

  if (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  ) {
    return 'Today'
  }
  if (
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate()
  ) {
    return 'Yesterday'
  }
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

export function msToTimelineSec(timestampMs: number, originMs: number): number {
  return (timestampMs - originMs) / 1000
}

export function timelineSecToMs(seconds: number, originMs: number): number {
  return seconds * 1000 + originMs
}
