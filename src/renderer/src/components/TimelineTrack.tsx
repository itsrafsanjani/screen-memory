import { useRef, useCallback, useMemo, useState, useEffect } from 'react'
import { Timeline as TimelineEditor } from '@xzdarcy/react-timeline-editor'
import type { TimelineState } from '@xzdarcy/react-timeline-editor'
import type { TimelineRow, TimelineAction, TimelineEffect } from '@xzdarcy/timeline-engine'
import '@xzdarcy/react-timeline-editor/dist/react-timeline-editor.css'
import type { ScreenshotRecord } from '../../../types'
import type { DayBounds } from '../../../types'
import {
  msToTimelineSec,
  timelineSecToMs,
  formatTimeShort,
  findNearestScreenshot
} from '../lib/time-utils'

interface Props {
  screenshots: ScreenshotRecord[]
  dayBounds: DayBounds
  currentTimestamp: number | null
  onSeek: (timestamp: number) => void
  onHoverTimestamp?: (ts: number | null) => void
}

const effects: Record<string, TimelineEffect> = {
  active: { id: 'active', name: 'active' },
  idle: { id: 'idle', name: 'idle' }
}

const START_LEFT = 20
const SCALE_SEC = 600 // 10-minute ticks

export function TimelineTrack({
  screenshots,
  dayBounds,
  currentTimestamp,
  onSeek,
  onHoverTimestamp
}: Props): React.JSX.Element {
  const timelineRef = useRef<TimelineState>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)

  const { first, last } = dayBounds
  const origin = first
  const totalDurationSec = (last - first) / 1000

  // Measure container width with ResizeObserver
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width)
      }
    })
    observer.observe(el)
    setContainerWidth(el.getBoundingClientRect().width)

    return () => observer.disconnect()
  }, [])

  // Build activity segments, convert to TimelineRow
  const editorData: TimelineRow[] = useMemo(() => {
    if (screenshots.length === 0) return [{ id: 'activity', actions: [] }]

    const uniqueTimestamps = [...new Map(screenshots.map((s) => [s.timestamp, s])).values()].sort(
      (a, b) => a.timestamp - b.timestamp
    )

    const actions: TimelineAction[] = []
    let segStart = uniqueTimestamps[0].timestamp
    let segIdle = uniqueTimestamps[0].is_idle
    const GAP_THRESHOLD = 15000

    for (let i = 1; i < uniqueTimestamps.length; i++) {
      const s = uniqueTimestamps[i]
      const gap = s.timestamp - uniqueTimestamps[i - 1].timestamp

      if (gap > GAP_THRESHOLD || s.is_idle !== segIdle) {
        actions.push({
          id: `seg-${actions.length}`,
          start: msToTimelineSec(segStart, origin),
          end: msToTimelineSec(uniqueTimestamps[i - 1].timestamp, origin),
          effectId: segIdle ? 'idle' : 'active',
          movable: false,
          flexible: false
        })
        segStart = s.timestamp
        segIdle = s.is_idle
      }
    }
    // Push last segment
    actions.push({
      id: `seg-${actions.length}`,
      start: msToTimelineSec(segStart, origin),
      end: msToTimelineSec(uniqueTimestamps[uniqueTimestamps.length - 1].timestamp, origin),
      effectId: segIdle ? 'idle' : 'active',
      movable: false,
      flexible: false
    })

    return [{ id: 'activity', actions }]
  }, [screenshots, origin])

  // Dynamic scaleWidth to fill container
  const { scaleWidth, scaleCount } = useMemo(() => {
    const count = Math.max(1, Math.ceil(totalDurationSec / SCALE_SEC))
    if (containerWidth <= 0) {
      return { scaleWidth: 120, scaleCount: count }
    }
    const availableWidth = containerWidth - START_LEFT
    const sw = Math.max(20, availableWidth / count)
    return { scaleWidth: sw, scaleCount: count }
  }, [totalDurationSec, containerWidth])

  // Sync cursor to current playback timestamp
  useEffect(() => {
    if (currentTimestamp !== null && timelineRef.current) {
      const sec = msToTimelineSec(currentTimestamp, origin)
      timelineRef.current.setTime(sec)
      timelineRef.current.reRender()
    }
  }, [currentTimestamp, origin])

  // Seek handler: convert timeline seconds to ms, find nearest screenshot
  const seekToTime = useCallback(
    (timeSec: number) => {
      const ms = timelineSecToMs(timeSec, origin)
      const idx = findNearestScreenshot(screenshots, ms)
      if (idx >= 0) onSeek(screenshots[idx].timestamp)
    },
    [origin, screenshots, onSeek]
  )

  const handleClickTimeArea = useCallback(
    (time: number) => {
      seekToTime(time)
      return true
    },
    [seekToTime]
  )

  const handleCursorDrag = useCallback(
    (time: number) => {
      seekToTime(time)
    },
    [seekToTime]
  )

  const handleClickRow = useCallback(
    (_e: React.MouseEvent, { time }: { row: TimelineRow; time: number }) => {
      seekToTime(time)
    },
    [seekToTime]
  )

  const handleClickAction = useCallback(
    (
      _e: React.MouseEvent,
      { time }: { action: TimelineAction; row: TimelineRow; time: number }
    ) => {
      seekToTime(time)
    },
    [seekToTime]
  )

  // Custom action rendering
  const getActionRender = useCallback((action: TimelineAction) => {
    const isIdle = action.effectId === 'idle'
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: '2px',
          backgroundColor: isIdle
            ? 'oklch(0.795 0.184 86.047 / 0.4)'
            : 'oklch(0.623 0.214 259.815 / 0.6)'
        }}
      />
    )
  }, [])

  // Custom scale rendering - show time labels
  const getScaleRender = useCallback(
    (scaleSec: number) => {
      const ms = timelineSecToMs(scaleSec, origin)
      return (
        <span style={{ fontSize: '10px', color: 'var(--muted-foreground)' }}>
          {formatTimeShort(ms)}
        </span>
      )
    },
    [origin]
  )

  // Hover handling — notify parent of hovered timestamp
  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!containerRef.current || !onHoverTimestamp) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left

      const scrollLeft =
        containerRef.current.querySelector('.timeline-editor-edit-area')?.scrollLeft ?? 0
      const pixelOffset = x - START_LEFT + scrollLeft
      const timeSec = (pixelOffset / scaleWidth) * SCALE_SEC
      const ms = timelineSecToMs(Math.max(0, timeSec), origin)
      onHoverTimestamp(ms)
    },
    [scaleWidth, origin, onHoverTimestamp]
  )

  const handleMouseLeave = useCallback(() => {
    onHoverTimestamp?.(null)
  }, [onHoverTimestamp])

  return (
    <div
      className="relative select-none"
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <TimelineEditor
        ref={timelineRef}
        editorData={editorData}
        effects={effects}
        scale={SCALE_SEC}
        scaleWidth={scaleWidth}
        scaleSplitCount={2}
        startLeft={START_LEFT}
        rowHeight={32}
        minScaleCount={scaleCount}
        maxScaleCount={scaleCount}
        hideCursor={false}
        disableDrag={true}
        dragLine={false}
        gridSnap={false}
        autoScroll={true}
        autoReRender={false}
        getActionRender={getActionRender}
        getScaleRender={getScaleRender}
        onClickTimeArea={handleClickTimeArea}
        onCursorDrag={handleCursorDrag}
        onCursorDragEnd={handleCursorDrag}
        onClickRow={handleClickRow}
        onClickAction={handleClickAction}
        onChange={() => {}}
        style={{ height: '60px' }}
      />
    </div>
  )
}
