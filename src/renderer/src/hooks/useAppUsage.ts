import { useEffect, useState } from 'react'
import type { AppUsageSegment } from '../../../types'

interface AppUsageState {
  segments: AppUsageSegment[]
  loading: boolean
  /** False when the native helper is missing, so nothing is being recorded. */
  available: boolean
  /** Set when the day could not be read at all — distinct from "no usage". */
  error: string | null
}

interface LoadedDay {
  date: string
  segments: AppUsageSegment[]
  available: boolean
  error: string | null
}

export function useAppUsage(date: string): AppUsageState {
  const [loaded, setLoaded] = useState<LoadedDay | null>(null)

  useEffect(() => {
    let cancelled = false

    Promise.all([window.electronAPI.getAppUsage(date), window.electronAPI.isAppStateAvailable()])
      .then(([rows, isAvailable]) => {
        if (!cancelled) setLoaded({ date, segments: rows, available: isAvailable, error: null })
      })
      .catch((e) => {
        console.error('Failed to load app usage:', e)
        // A failed read is not an idle day. Reporting it as one would tell the
        // user their time simply wasn't tracked, which is worse than an error.
        if (!cancelled) {
          setLoaded({
            date,
            segments: [],
            available: true,
            error: e instanceof Error ? e.message : 'Could not load app usage'
          })
        }
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
    available: current?.available ?? true,
    error: current?.error ?? null
  }
}
