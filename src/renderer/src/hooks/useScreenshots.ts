import { useState, useEffect, useCallback } from 'react'
import type { ScreenshotRecord, DayBounds } from '../../../types'

export function useScreenshots(date: string): {
  screenshots: ScreenshotRecord[]
  dayBounds: DayBounds | null
  loading: boolean
  reload: () => void
} {
  const [screenshots, setScreenshots] = useState<ScreenshotRecord[]>([])
  const [dayBounds, setDayBounds] = useState<DayBounds | null>(null)
  const [loading, setLoading] = useState(false)

  const loadDay = useCallback(async (dateStr: string) => {
    setLoading(true)
    try {
      const [shots, bounds] = await Promise.all([
        window.electronAPI.getScreenshotsByDate(dateStr),
        window.electronAPI.getDayBounds(dateStr)
      ])
      setScreenshots(shots)
      setDayBounds(bounds)
    } catch (err) {
      console.error('Failed to load screenshots:', err)
      setScreenshots([])
      setDayBounds(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (date) loadDay(date)
  }, [date, loadDay])

  return { screenshots, dayBounds, loading, reload: () => loadDay(date) }
}
