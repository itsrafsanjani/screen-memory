import { useEffect, useMemo, useState } from 'react'
import { LayoutGrid, Maximize2, Monitor } from 'lucide-react'
import type { ScreenshotRecord } from '../../../types'
import { findNearestScreenshot } from '../lib/time-utils'
import { screenshotSrc } from '../lib/screenshot-src'
import { cn } from '@/lib/utils'
import { CrossfadeImage } from './CrossfadeImage'
import { ScreenshotLightbox } from './ScreenshotLightbox'

interface Props {
  screenshots: ScreenshotRecord[]
  currentTimestamp: number | null
  hoverTimestamp?: number | null
  onLightboxOpenChange?: (open: boolean) => void
}

const TILE_CLASS = 'h-20 aspect-video rounded-md border-2 transition'
const TILE_INACTIVE = 'border-transparent opacity-70 hover:opacity-100 hover:border-border'

export function ScreenshotViewer({
  screenshots,
  currentTimestamp,
  hoverTimestamp,
  onLightboxOpenChange
}: Props): React.JSX.Element {
  const displayTimestamp = hoverTimestamp ?? currentTimestamp
  const [selectedDisplayId, setSelectedDisplayId] = useState<string | null>(null)
  const [lightboxShot, setLightboxShot] = useState<ScreenshotRecord | null>(null)

  const sorted = useMemo(() => {
    if (!displayTimestamp || screenshots.length === 0) return []

    const idx = findNearestScreenshot(screenshots, displayTimestamp)
    if (idx < 0) return []

    const targetTs = screenshots[idx].timestamp
    return screenshots
      .filter((s) => s.timestamp === targetTs)
      .toSorted((a, b) => a.display_id.localeCompare(b.display_id))
  }, [screenshots, displayTimestamp])

  // Focusing only makes sense with multiple monitors; a lone screen already fills the grid.
  const canFocus = sorted.length > 1
  // Focused mode requires a selected display that still exists at this timestamp;
  // otherwise (null, or the display dropped out) we fall back to the default grid.
  const selectedIndex = canFocus ? sorted.findIndex((s) => s.display_id === selectedDisplayId) : -1
  const selected = selectedIndex >= 0 ? sorted[selectedIndex] : null

  // The lightbox owns the arrow keys while it is open, so the global playback
  // shortcuts have to stand down.
  useEffect(() => {
    onLightboxOpenChange?.(lightboxShot !== null)
  }, [lightboxShot, onLightboxOpenChange])

  const lightbox = lightboxShot ? (
    <ScreenshotLightbox
      // Remount per opened frame so the lightbox starts on that frame.
      key={`${lightboxShot.display_id}:${lightboxShot.timestamp}`}
      open
      onOpenChange={(open) => {
        if (!open) setLightboxShot(null)
      }}
      screenshots={screenshots}
      displayId={lightboxShot.display_id}
      timestamp={lightboxShot.timestamp}
      label={displayLabel(sorted, lightboxShot)}
    />
  ) : null

  if (sorted.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Monitor className="size-12 mx-auto mb-3 opacity-20" />
          <p>No screenshots to display</p>
          <p className="text-sm mt-1">Start recording to capture your screen</p>
        </div>
      </div>
    )
  }

  // Focused mode: large preview of the selected display + filmstrip selector.
  if (selected) {
    return (
      <div className="flex-1 flex flex-col gap-3 p-4 min-h-0">
        <button
          type="button"
          aria-label={`Open display ${selectedIndex + 1} full size`}
          title="Open full size"
          onClick={() => setLightboxShot(selected)}
          className="group relative flex-1 min-h-0 flex items-center justify-center"
        >
          <CrossfadeImage
            key={selected.display_id}
            src={selected.file_path}
            alt={`Display ${selectedIndex + 1}`}
          />
          <ExpandHint />
        </button>

        <div className="flex gap-2 justify-center shrink-0">
          <button
            type="button"
            aria-label="Show all screens"
            title="Show all screens"
            onClick={() => setSelectedDisplayId(null)}
            className={cn(
              TILE_CLASS,
              TILE_INACTIVE,
              'flex items-center justify-center text-muted-foreground'
            )}
          >
            <LayoutGrid className="size-5" />
          </button>
          {sorted.map((shot, i) => (
            <button
              key={shot.display_id}
              type="button"
              aria-pressed={shot.display_id === selected.display_id}
              aria-label={`Display ${i + 1}`}
              title={`Display ${i + 1}`}
              onClick={() => setSelectedDisplayId(shot.display_id)}
              className={cn(
                TILE_CLASS,
                'overflow-hidden',
                shot.display_id === selected.display_id ? 'border-primary' : TILE_INACTIVE
              )}
            >
              <img
                src={screenshotSrc(shot.file_path)}
                alt={`Display ${i + 1}`}
                className="h-full w-full object-cover"
                draggable={false}
              />
            </button>
          ))}
        </div>

        {lightbox}
      </div>
    )
  }

  // Default grid: all screens at once. With multiple monitors each cell focuses
  // on click; a single screen has nothing to focus, so it opens full size.
  return (
    <div className="flex-1 flex gap-2 p-4 min-h-0">
      {sorted.map((shot, i) => (
        <button
          key={shot.display_id}
          type="button"
          aria-label={canFocus ? `Focus display ${i + 1}` : 'Open full size'}
          title={canFocus ? `Focus display ${i + 1}` : 'Open full size'}
          onClick={() => (canFocus ? setSelectedDisplayId(shot.display_id) : setLightboxShot(shot))}
          className="group relative flex-1 min-w-0 flex items-center justify-center"
        >
          <CrossfadeImage src={shot.file_path} alt={`Display ${i + 1}`} />
          <ExpandHint />
        </button>
      ))}

      {lightbox}
    </div>
  )
}

function ExpandHint(): React.JSX.Element {
  return (
    <span className="absolute top-2 right-2 flex items-center justify-center rounded-md bg-black/50 p-1.5 text-white opacity-0 transition group-hover:opacity-100">
      <Maximize2 className="size-4" />
    </span>
  )
}

function displayLabel(sorted: ScreenshotRecord[], shot: ScreenshotRecord): string {
  const index = sorted.findIndex((s) => s.display_id === shot.display_id)
  return `Display ${index >= 0 ? index + 1 : 1}`
}
