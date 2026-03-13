import { useRef, useCallback, useMemo, useState, useEffect } from 'react'
import type { ScreenshotRecord } from '../../../types'
import type { DayBounds } from '../../../types'
import { formatTimeShort, findNearestScreenshot } from '../lib/time-utils'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

interface Props {
  screenshots: ScreenshotRecord[]
  dayBounds: DayBounds
  currentTimestamp: number | null
  onSeek: (timestamp: number) => void
  onHoverTimestamp?: (ts: number | null) => void
}

interface Segment {
  startMs: number
  endMs: number
  isIdle: boolean
}

interface VisibleRange {
  start: number
  end: number
}

const GAP_THRESHOLD = 15000
const MIN_VISIBLE_MS = 5 * 60 * 1000 // 5 minutes

function getTickInterval(durationMs: number): number {
  const durationHrs = durationMs / (1000 * 60 * 60)
  if (durationHrs < 1) return 5 * 60 * 1000 // 5 min
  if (durationHrs < 4) return 15 * 60 * 1000 // 15 min
  if (durationHrs < 8) return 30 * 60 * 1000 // 30 min
  return 60 * 60 * 1000 // 1 hr
}

export function TimelineTrack({
  screenshots,
  dayBounds,
  currentTimestamp,
  onSeek,
  onHoverTimestamp
}: Props): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const [hoverX, setHoverX] = useState<number | null>(null)
  const [hoverMs, setHoverMs] = useState<number | null>(null)

  // Activity-based visible range with padding
  const fullRange = useMemo<VisibleRange>(() => {
    const duration = dayBounds.last - dayBounds.first
    const padding = Math.max(5 * 60 * 1000, duration * 0.02)
    return { start: dayBounds.first - padding, end: dayBounds.last + padding }
  }, [dayBounds.first, dayBounds.last])

  const [visibleRange, setVisibleRange] = useState<VisibleRange>(fullRange)

  // Reset visible range when day changes
  useEffect(() => {
    setVisibleRange(fullRange)
  }, [fullRange])

  const rangeDuration = visibleRange.end - visibleRange.start

  // Build activity segments
  const segments = useMemo<Segment[]>(() => {
    if (screenshots.length === 0) return []

    const unique = [...new Map(screenshots.map((s) => [s.timestamp, s])).values()].sort(
      (a, b) => a.timestamp - b.timestamp
    )

    const segs: Segment[] = []
    let segStart = unique[0].timestamp
    let segIdle = unique[0].is_idle

    for (let i = 1; i < unique.length; i++) {
      const s = unique[i]
      const gap = s.timestamp - unique[i - 1].timestamp

      if (gap > GAP_THRESHOLD || s.is_idle !== segIdle) {
        segs.push({ startMs: segStart, endMs: unique[i - 1].timestamp, isIdle: segIdle })
        segStart = s.timestamp
        segIdle = s.is_idle
      }
    }
    segs.push({ startMs: segStart, endMs: unique[unique.length - 1].timestamp, isIdle: segIdle })

    return segs
  }, [screenshots])

  // Compute time from mouse X position on the bar
  const xToMs = useCallback(
    (clientX: number): number | null => {
      const bar = barRef.current
      if (!bar) return null
      const rect = bar.getBoundingClientRect()
      const x = clientX - rect.left
      const ratio = Math.max(0, Math.min(1, x / rect.width))
      return visibleRange.start + ratio * rangeDuration
    },
    [visibleRange.start, rangeDuration]
  )

  const seekToMs = useCallback(
    (ms: number) => {
      const idx = findNearestScreenshot(screenshots, ms)
      if (idx >= 0) onSeek(screenshots[idx].timestamp)
    },
    [screenshots, onSeek]
  )

  // Click-to-seek
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDragging.current = true
      const ms = xToMs(e.clientX)
      if (ms !== null) {
        seekToMs(ms)
        onHoverTimestamp?.(ms)
      }
    },
    [xToMs, seekToMs, onHoverTimestamp]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const bar = barRef.current
      if (!bar) return
      const rect = bar.getBoundingClientRect()
      const x = e.clientX - rect.left

      if (isDragging.current) {
        const ms = xToMs(e.clientX)
        if (ms !== null) {
          seekToMs(ms)
          onHoverTimestamp?.(ms)
        }
      } else {
        // Hover tooltip
        const ms = xToMs(e.clientX)
        if (ms !== null) {
          setHoverX(x)
          setHoverMs(ms)
        }
      }
    },
    [xToMs, seekToMs, onHoverTimestamp]
  )

  const handleMouseUp = useCallback(() => {
    isDragging.current = false
    onHoverTimestamp?.(null)
  }, [onHoverTimestamp])

  const handleMouseLeave = useCallback(() => {
    isDragging.current = false
    setHoverX(null)
    setHoverMs(null)
    onHoverTimestamp?.(null)
  }, [onHoverTimestamp])

  // Zoom via wheel — attached imperatively to allow preventDefault
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const handler = (e: WheelEvent): void => {
      e.preventDefault()
      const bar = barRef.current
      if (!bar) return

      const rect = bar.getBoundingClientRect()
      const cursorX = e.clientX - rect.left
      const cursorRatio = Math.max(0, Math.min(1, cursorX / rect.width))

      setVisibleRange((prev) => {
        const duration = prev.end - prev.start
        const factor = e.deltaY > 0 ? 1.2 : 1 / 1.2
        const newDuration = Math.max(
          MIN_VISIBLE_MS,
          Math.min(fullRange.end - fullRange.start, duration * factor)
        )

        const cursorMs = prev.start + cursorRatio * duration
        const newStart = cursorMs - cursorRatio * newDuration
        const newEnd = newStart + newDuration

        return { start: newStart, end: newEnd }
      })
    }

    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [fullRange.start, fullRange.end])

  // Auto-follow during playback
  useEffect(() => {
    if (currentTimestamp === null) return

    setVisibleRange((prev) => {
      const duration = prev.end - prev.start
      const threshold = prev.start + duration * 0.9
      if (currentTimestamp > threshold) {
        const shift = duration * 0.5
        return { start: prev.start + shift, end: prev.end + shift }
      }
      if (currentTimestamp < prev.start) {
        const shift = duration * 0.5
        return { start: prev.start - shift, end: prev.end - shift }
      }
      return prev
    })
  }, [currentTimestamp])

  // Playhead position
  const playheadPct =
    currentTimestamp !== null
      ? ((currentTimestamp - visibleRange.start) / rangeDuration) * 100
      : null

  // Time ticks
  const ticks = useMemo(() => {
    const interval = getTickInterval(rangeDuration)
    const firstTick = Math.ceil(visibleRange.start / interval) * interval
    const result: { ms: number; pct: number }[] = []
    for (let t = firstTick; t <= visibleRange.end; t += interval) {
      const pct = ((t - visibleRange.start) / rangeDuration) * 100
      result.push({ ms: t, pct })
    }
    return result
  }, [visibleRange.start, visibleRange.end, rangeDuration])

  return (
    <div ref={containerRef} className="px-4 select-none">
      {/* Bar area */}
      <div
        ref={barRef}
        className="relative h-7 bg-secondary rounded cursor-pointer"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
      >
        {/* Segments */}
        {segments.map((seg, i) => {
          const left = ((seg.startMs - visibleRange.start) / rangeDuration) * 100
          const width = ((seg.endMs - seg.startMs) / rangeDuration) * 100
          return (
            <div
              key={i}
              className={seg.isIdle ? 'bg-idle/40' : 'bg-active/60'}
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${left}%`,
                width: `${width}%`,
                borderRadius: '2px'
              }}
            />
          )
        })}

        {/* Playhead */}
        {playheadPct !== null && playheadPct >= 0 && playheadPct <= 100 ? (
          <div
            className="bg-playhead"
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${playheadPct}%`,
              width: '2px',
              transform: 'translateX(-1px)',
              zIndex: 10
            }}
          />
        ) : null}

        {/* Hover tooltip */}
        {hoverX != null && hoverMs != null ? (
          <Tooltip open>
            <TooltipTrigger asChild>
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  bottom: 0,
                  left: `${hoverX}px`,
                  width: '1px',
                  pointerEvents: 'none'
                }}
              />
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {formatTimeShort(hoverMs)}
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      {/* Time labels */}
      <div className="relative h-4 mt-0.5">
        {ticks.map((t) => (
          <span
            key={t.ms}
            className="absolute text-[10px] text-muted-foreground whitespace-nowrap -translate-x-1/2"
            style={{ left: `${t.pct}%` }}
          >
            {formatTimeShort(t.ms)}
          </span>
        ))}
      </div>
    </div>
  )
}
