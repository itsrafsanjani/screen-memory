import { useRef, useCallback, useMemo } from 'react'
import type { ScreenshotRecord, GitCommit, DayBounds } from '../../../types'
import { formatTimeShort, findNearestScreenshot } from '../lib/time-utils'
import { useTimelineZoom } from '../hooks/useTimelineZoom'
import { useTimelineHover } from '../hooks/useTimelineHover'
import { usePlaybackFollow } from '../hooks/usePlaybackFollow'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { RangeSelection } from '../hooks/useRangeSelection'

interface Props {
  screenshots: ScreenshotRecord[]
  dayBounds: DayBounds
  currentTimestamp: number | null
  onSeek: (timestamp: number) => void
  onHoverTimestamp?: (ts: number | null) => void
  gitCommits?: GitCommit[]
  selectMode: boolean
  selection: RangeSelection | null
  onSelectionChange: (selection: RangeSelection | null) => void
}

interface Segment {
  startMs: number
  endMs: number
  isIdle: boolean
}

const GAP_THRESHOLD = 15000
const ONE_MIN = 60 * 1000
const ONE_HOUR = 60 * ONE_MIN

function getTickInterval(durationMs: number): number {
  const durationHrs = durationMs / ONE_HOUR
  if (durationHrs < 1) return 5 * ONE_MIN
  if (durationHrs < 4) return 15 * ONE_MIN
  if (durationHrs < 8) return 30 * ONE_MIN
  return ONE_HOUR
}

export function TimelineTrack({
  screenshots,
  dayBounds,
  currentTimestamp,
  onSeek,
  onHoverTimestamp,
  gitCommits,
  selectMode,
  selection,
  onSelectionChange
}: Props): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const isSelecting = useRef(false)
  const selectAnchorMs = useRef<number | null>(null)

  const { visibleRange, setVisibleRange, rangeDuration, xToMs } = useTimelineZoom({
    dayBounds,
    containerRef,
    barRef
  })
  const { hoverX, hoverMs, setHover, clearHover } = useTimelineHover()
  usePlaybackFollow(currentTimestamp, setVisibleRange)

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

  const seekToMs = useCallback(
    (ms: number) => {
      const idx = findNearestScreenshot(screenshots, ms)
      if (idx >= 0) onSeek(screenshots[idx].timestamp)
    },
    [screenshots, onSeek]
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const ms = xToMs(e.clientX)

      if (selectMode) {
        if (ms === null) return
        isSelecting.current = true
        selectAnchorMs.current = ms
        onSelectionChange({ startMs: ms, endMs: ms })
        return
      }

      isDragging.current = true
      if (ms !== null) {
        seekToMs(ms)
        onHoverTimestamp?.(ms)
      }
    },
    [xToMs, selectMode, onSelectionChange, seekToMs, onHoverTimestamp]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const bar = barRef.current
      if (!bar) return
      const ms = xToMs(e.clientX)
      if (ms === null) return

      if (selectMode) {
        if (isSelecting.current && selectAnchorMs.current !== null) {
          const anchor = selectAnchorMs.current
          onSelectionChange({ startMs: Math.min(anchor, ms), endMs: Math.max(anchor, ms) })
        } else {
          const rect = bar.getBoundingClientRect()
          setHover(e.clientX - rect.left, ms)
        }
        return
      }

      if (isDragging.current) {
        seekToMs(ms)
        onHoverTimestamp?.(ms)
        return
      }
      const rect = bar.getBoundingClientRect()
      setHover(e.clientX - rect.left, ms)
    },
    [xToMs, selectMode, onSelectionChange, seekToMs, onHoverTimestamp, setHover]
  )

  const handleMouseUp = useCallback(() => {
    if (selectMode) {
      isSelecting.current = false
      selectAnchorMs.current = null
      // A plain click (no dragged range) clears the selection.
      if (selection && selection.startMs === selection.endMs) {
        onSelectionChange(null)
      }
      return
    }
    isDragging.current = false
    onHoverTimestamp?.(null)
  }, [selectMode, selection, onSelectionChange, onHoverTimestamp])

  const handleMouseLeave = useCallback(() => {
    if (selectMode) {
      isSelecting.current = false
      selectAnchorMs.current = null
      clearHover()
      return
    }
    isDragging.current = false
    clearHover()
    onHoverTimestamp?.(null)
  }, [selectMode, clearHover, onHoverTimestamp])

  const playheadPct =
    currentTimestamp === null
      ? null
      : ((currentTimestamp - visibleRange.start) / rangeDuration) * 100

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
        className={`relative h-8 bg-secondary rounded ${selectMode ? 'cursor-crosshair' : 'cursor-pointer'}`}
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
              className={seg.isIdle ? 'bg-idle/30' : 'bg-active/50'}
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

        {/* Selection band (delete range) */}
        {selection
          ? (() => {
              const left = ((selection.startMs - visibleRange.start) / rangeDuration) * 100
              const width = ((selection.endMs - selection.startMs) / rangeDuration) * 100
              return (
                <div
                  className="bg-destructive/25 border-x-2 border-destructive"
                  style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: `${left}%`,
                    width: `${width}%`,
                    zIndex: 5,
                    pointerEvents: 'none'
                  }}
                />
              )
            })()
          : null}

        {/* Git commit markers */}
        {gitCommits?.map((commit) => {
          const pct = ((commit.timestamp - visibleRange.start) / rangeDuration) * 100
          if (pct < 0 || pct > 100) return null
          return (
            <div
              key={commit.id}
              className="bg-git-commit cursor-pointer"
              title={`${commit.repo_name}: ${commit.message}`}
              onClick={(e) => {
                e.stopPropagation()
                seekToMs(commit.timestamp)
              }}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                position: 'absolute',
                top: '50%',
                left: `${pct}%`,
                width: '10px',
                height: '10px',
                transform: 'translate(-5px, -50%) rotate(45deg)',
                zIndex: 15
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
              width: '3px',
              transform: 'translateX(-1.5px)',
              zIndex: 10,
              boxShadow: '0 0 6px rgba(0, 0, 0, 0.15)'
            }}
          />
        ) : null}

        {/* Hover tooltip */}
        {hoverX !== null && hoverMs !== null ? (
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
      <div className="relative h-5 mt-1">
        {ticks.map((t) => (
          <span
            key={t.ms}
            className="absolute text-[11px] text-muted-foreground whitespace-nowrap -translate-x-1/2"
            style={{ left: `${t.pct}%` }}
          >
            {formatTimeShort(t.ms)}
          </span>
        ))}
      </div>
    </div>
  )
}
