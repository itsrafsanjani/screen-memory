import { useState, useEffect, useRef, useCallback } from 'react'
import type { ScreenshotRecord } from '../../../types'
import { findNearestScreenshot } from '../lib/time-utils'

export function usePlayback(
  screenshots: ScreenshotRecord[],
  currentTimestamp: number | null,
  setCurrentTimestamp: (ts: number) => void
) {
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const stop = useCallback(() => {
    setIsPlaying(false)
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const play = useCallback(() => {
    if (screenshots.length === 0) return
    setIsPlaying(true)
  }, [screenshots.length])

  const toggle = useCallback(() => {
    if (isPlaying) stop()
    else play()
  }, [isPlaying, stop, play])

  useEffect(() => {
    if (!isPlaying || screenshots.length === 0 || currentTimestamp === null) {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      return
    }

    const intervalMs = 200 / speed

    timerRef.current = setInterval(() => {
      const currentIdx = findNearestScreenshot(screenshots, currentTimestamp)
      if (currentIdx < 0) {
        stop()
        return
      }

      // Find the next unique timestamp (skip same-timestamp screenshots from different displays)
      let nextIdx = currentIdx + 1
      while (
        nextIdx < screenshots.length &&
        screenshots[nextIdx].timestamp === screenshots[currentIdx].timestamp
      ) {
        nextIdx++
      }

      if (nextIdx >= screenshots.length) {
        stop()
        return
      }

      setCurrentTimestamp(screenshots[nextIdx].timestamp)
    }, intervalMs)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [isPlaying, speed, screenshots, currentTimestamp, setCurrentTimestamp, stop])

  const skipForward = useCallback(() => {
    if (!currentTimestamp || screenshots.length === 0) return
    const target = currentTimestamp + 60000
    const idx = findNearestScreenshot(screenshots, target)
    if (idx >= 0) setCurrentTimestamp(screenshots[idx].timestamp)
  }, [currentTimestamp, screenshots, setCurrentTimestamp])

  const skipBackward = useCallback(() => {
    if (!currentTimestamp || screenshots.length === 0) return
    const target = currentTimestamp - 60000
    const idx = findNearestScreenshot(screenshots, target)
    if (idx >= 0) setCurrentTimestamp(screenshots[idx].timestamp)
  }, [currentTimestamp, screenshots, setCurrentTimestamp])

  return {
    isPlaying,
    speed,
    setSpeed,
    play,
    stop,
    toggle,
    skipForward,
    skipBackward
  }
}
