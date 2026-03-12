import { useState, useEffect, useCallback } from 'react'
import { format } from 'date-fns'
import { useScreenshots } from './useScreenshots'

export function useTimeline() {
  const [currentDate, setCurrentDate] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [currentTimestamp, setCurrentTimestamp] = useState<number | null>(null)
  const [availableDates, setAvailableDates] = useState<string[]>([])

  const { screenshots, dayBounds, loading } = useScreenshots(currentDate)

  useEffect(() => {
    window.electronAPI.getAvailableDates().then(setAvailableDates).catch(console.error)
  }, [])

  // Set initial timestamp to first screenshot when day loads
  useEffect(() => {
    if (dayBounds) {
      setCurrentTimestamp(dayBounds.first)
    }
  }, [dayBounds])

  const goToDate = useCallback((date: string) => {
    setCurrentDate(date)
    setCurrentTimestamp(null)
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
