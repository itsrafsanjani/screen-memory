import { useMemo, useState } from 'react'
import type { ScreenshotRecord } from '../../../types'

export interface DisplayOption {
  id: string
  label: string
  width: number | null
  height: number | null
}

interface DisplayFilter {
  displays: DisplayOption[]
  selectedDisplayId: string | null
  setSelectedDisplayId: (id: string | null) => void
  filtered: ScreenshotRecord[]
}

/**
 * A day's distinct displays plus the currently filtered subset of screenshots.
 *
 * The selection is deliberately kept even when the chosen display has no data
 * for the day on screen — the day then shows every display, but switching back
 * to a day that does have it restores the filter instead of silently dropping
 * it.
 */
export function useDisplayFilter(screenshots: ScreenshotRecord[]): DisplayFilter {
  const [selectedDisplayId, setSelectedDisplayId] = useState<string | null>(null)

  const displays = useMemo(() => {
    const first = new Map<string, ScreenshotRecord>()
    for (const shot of screenshots) {
      if (!first.has(shot.display_id)) first.set(shot.display_id, shot)
    }
    // Same ordering as ScreenshotViewer, so "Display 2" means the same tile.
    return [...first.entries()]
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([id, shot], i) => ({
        id,
        label: `Display ${i + 1}`,
        width: shot.width,
        height: shot.height
      }))
  }, [screenshots])

  const isSelectable = displays.some((d) => d.id === selectedDisplayId)

  const filtered = useMemo(() => {
    if (!selectedDisplayId || !isSelectable) return screenshots
    return screenshots.filter((s) => s.display_id === selectedDisplayId)
  }, [screenshots, selectedDisplayId, isSelectable])

  return { displays, selectedDisplayId, setSelectedDisplayId, filtered }
}
