import { useMemo, useState, useCallback } from 'react'
import { Monitor } from 'lucide-react'
import type { ScreenshotRecord } from '../../../types'
import { findNearestScreenshot } from '../lib/time-utils'

interface Props {
  screenshots: ScreenshotRecord[]
  currentTimestamp: number | null
  hoverTimestamp?: number | null
}

function CrossfadeImage({ src, alt }: { src: string; alt: string }): React.JSX.Element {
  const [loaded, setLoaded] = useState(false)
  const [displaySrc, setDisplaySrc] = useState(src)
  const [nextSrc, setNextSrc] = useState<string | null>(null)

  // When src changes, start loading the new image behind the current one
  if (src !== displaySrc && src !== nextSrc) {
    setNextSrc(src)
    setLoaded(false)
  }

  const handleLoad = useCallback(() => {
    setLoaded(true)
    // After transition, promote next to display
    setDisplaySrc(nextSrc!)
    setNextSrc(null)
  }, [nextSrc])

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* Current (visible) image */}
      <img
        src={`screenmemory://${encodeURIComponent(displaySrc)}`}
        alt={alt}
        className="max-w-full max-h-full object-contain rounded absolute"
        style={{ willChange: 'opacity' }}
        draggable={false}
      />
      {/* Next (loading/fading in) image */}
      {nextSrc && (
        <img
          src={`screenmemory://${encodeURIComponent(nextSrc)}`}
          alt={alt}
          className="max-w-full max-h-full object-contain rounded absolute"
          style={{
            opacity: loaded ? 1 : 0,
            transition: 'opacity 150ms ease',
            willChange: 'opacity'
          }}
          draggable={false}
          onLoad={handleLoad}
        />
      )}
    </div>
  )
}

export function ScreenshotViewer({
  screenshots,
  currentTimestamp,
  hoverTimestamp
}: Props): React.JSX.Element {
  const displayTimestamp = hoverTimestamp ?? currentTimestamp

  const displayScreenshots = useMemo(() => {
    if (!displayTimestamp || screenshots.length === 0) return []

    const idx = findNearestScreenshot(screenshots, displayTimestamp)
    if (idx < 0) return []

    const targetTs = screenshots[idx].timestamp
    return screenshots.filter((s) => s.timestamp === targetTs)
  }, [screenshots, displayTimestamp])

  if (displayScreenshots.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Monitor className="size-10 mx-auto mb-2 opacity-30" />
          <p>No screenshots to display</p>
          <p className="text-sm mt-1">Start recording to capture your screen</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex gap-2 p-2 min-h-0">
      {displayScreenshots
        .sort((a, b) => a.display_id.localeCompare(b.display_id))
        .map((shot) => (
          <div key={shot.display_id} className="flex-1 flex items-center justify-center min-w-0">
            <CrossfadeImage src={shot.file_path} alt={`Display ${shot.display_id}`} />
          </div>
        ))}
    </div>
  )
}
