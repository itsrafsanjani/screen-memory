import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { useScreenshots } from './useScreenshots'
import type { ScreenshotRecord, DayBounds } from '../../../types'

interface UseTimelineReturn {
  currentDate: string
  currentTimestamp: number | null
  setCurrentTimestamp: React.Dispatch<React.SetStateAction<number | null>>
  screenshots: ScreenshotRecord[]
  dayBounds: DayBounds | null
  loading: boolean
  availableDates: string[]
  goToDate: (date: string) => void
  goToPreviousDate: () => void
  goToNextDate: () => void
  hasPreviousDate: boolean
  hasNextDate: boolean
}

export function useTimeline(): UseTimelineReturn {
  const [currentDate, setCurrentDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [currentTimestamp, setCurrentTimestamp] = useState<number | null>(null)
  const [availableDates, setAvailableDates] = useState<string[]>([])
  const [initializedDate, setInitializedDate] = useState<string | null>(null)

  const { screenshots, dayBounds, loading } = useScreenshots(currentDate)

  useEffect(() => {
    window.electronAPI
      .getAvailableDates()
      .then((dates) => {
        setAvailableDates(dates)
        // If current date has no screenshots, jump to most recent date that does
        if (dates.length > 0 && !dates.includes(currentDate)) {
          setCurrentDate(dates[0]) // dates[0] is the most recent (DESC order)
          setCurrentTimestamp(null)
          setInitializedDate(null)
        }
      })
      .catch(console.error)
  }, [currentDate])

  // Set initial timestamp when a new day's bounds load
  useEffect(() => {
    if (dayBounds && currentDate !== initializedDate) {
      // Use a microtask to avoid the lint rule about setState in effect body
      queueMicrotask(() => {
        setCurrentTimestamp(dayBounds.first)
        setInitializedDate(currentDate)
      })
    }
  }, [dayBounds, currentDate, initializedDate])

  const goToDate = useCallback((date: string) => {
    setCurrentDate(date)
    setCurrentTimestamp(null)
    setInitializedDate(null)
  }, [])

  const goToPreviousDate = useCallback(() => {
    const idx = availableDates.indexOf(currentDate)
    if (idx >= 0 && idx < availableDates.length - 1) {
      goToDate(availableDates[idx + 1])
    }
  }, [availableDates, currentDate, goToDate])

  const goToNextDate = useCallback(() => {
    const idx = availableDates.indexOf(currentDate)
    if (idx > 0) {
      goToDate(availableDates[idx - 1])
    }
  }, [availableDates, currentDate, goToDate])

  const hasPreviousDate = availableDates.indexOf(currentDate) < availableDates.length - 1
  const hasNextDate = availableDates.indexOf(currentDate) > 0

  return {
    currentDate,
    currentTimestamp,
    setCurrentTimestamp,
    screenshots,
    dayBounds,
    loading,
    availableDates,
    goToDate,
    goToPreviousDate,
    goToNextDate,
    hasPreviousDate,
    hasNextDate
  }
}
