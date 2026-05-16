import { useEffect, type Dispatch, type SetStateAction } from 'react'
import type { VisibleRange } from './useTimelineZoom'

const FOLLOW_AHEAD_RATIO = 0.9
const FOLLOW_SHIFT_RATIO = 0.5

export function usePlaybackFollow(
  currentTimestamp: number | null,
  setVisibleRange: Dispatch<SetStateAction<VisibleRange>>
): void {
  useEffect(() => {
    if (currentTimestamp === null) return

    setVisibleRange((prev) => {
      const duration = prev.end - prev.start
      const threshold = prev.start + duration * FOLLOW_AHEAD_RATIO
      if (currentTimestamp > threshold) {
        const shift = duration * FOLLOW_SHIFT_RATIO
        return { start: prev.start + shift, end: prev.end + shift }
      }
      if (currentTimestamp < prev.start) {
        const shift = duration * FOLLOW_SHIFT_RATIO
        return { start: prev.start - shift, end: prev.end - shift }
      }
      return prev
    })
  }, [currentTimestamp, setVisibleRange])
}
