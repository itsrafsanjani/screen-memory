import { useEffect, useState } from 'react'
import type { AppUsageSegment } from '../../../types'

interface AppUsageState {
  segments: AppUsageSegment[]
  loading: boolean
  /** False when the native helper is missing, so nothing is being recorded. */
  available: boolean
}

interface LoadedDay {
  date: string
  segments: AppUsageSegment[]
  available: boolean
}

export function useAppUsage(date: string): AppUsageState {
  const [loaded, setLoaded] = useState<LoadedDay | null>(null)

  useEffect(() => {
    let cancelled = false

    Promise.all([window.electronAPI.getAppUsage(date), window.electronAPI.isAppStateAvailable()])
      .then(([rows, isAvailable]) => {
        if (!cancelled) setLoaded({ date, segments: rows, available: isAvailable })
      })
      .catch((e) => {
        console.error('Failed to load app usage:', e)
        if (!cancelled) setLoaded({ date, segments: [], available: true })
      })

    return () => {
      cancelled = true
    }
  }, [date])

  // Tagging the result with its date is what makes `loading` derivable: the
  // previous day's segments never show up while the new day is still loading.
  const current = loaded?.date === date ? loaded : null

  return {
    segments: current?.segments ?? [],
    loading: current === null,
    available: current?.available ?? true
  }
}
