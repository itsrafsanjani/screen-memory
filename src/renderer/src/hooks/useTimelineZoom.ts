import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction
} from 'react'
import type { DayBounds } from '../../../types'

export interface VisibleRange {
  start: number
  end: number
}

const MIN_VISIBLE_MS = 5 * 60 * 1000
const ZOOM_FACTOR = 1.2

interface UseTimelineZoomArgs {
  dayBounds: DayBounds
  containerRef: RefObject<HTMLDivElement | null>
  barRef: RefObject<HTMLDivElement | null>
}

interface UseTimelineZoomResult {
  visibleRange: VisibleRange
  setVisibleRange: Dispatch<SetStateAction<VisibleRange>>
  rangeDuration: number
  xToMs: (clientX: number) => number | null
}

export function useTimelineZoom({
  dayBounds,
  containerRef,
  barRef
}: UseTimelineZoomArgs): UseTimelineZoomResult {
  const fullRange = useMemo<VisibleRange>(() => {
    const duration = dayBounds.last - dayBounds.first
    const padding = Math.max(MIN_VISIBLE_MS, duration * 0.02)
    return { start: dayBounds.first - padding, end: dayBounds.last + padding }
  }, [dayBounds.first, dayBounds.last])

  const [visibleRange, setVisibleRange] = useState<VisibleRange>(() => fullRange)

  useEffect(() => {
    setVisibleRange(fullRange)
  }, [fullRange])

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
        const factor = e.deltaY > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR
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
  }, [fullRange.start, fullRange.end, containerRef, barRef])

  const rangeDuration = visibleRange.end - visibleRange.start

  const xToMs = useCallback(
    (clientX: number): number | null => {
      const bar = barRef.current
      if (!bar) return null
      const rect = bar.getBoundingClientRect()
      const x = clientX - rect.left
      const ratio = Math.max(0, Math.min(1, x / rect.width))
      return visibleRange.start + ratio * rangeDuration
    },
    [barRef, visibleRange.start, rangeDuration]
  )

  return { visibleRange, setVisibleRange, rangeDuration, xToMs }
}
