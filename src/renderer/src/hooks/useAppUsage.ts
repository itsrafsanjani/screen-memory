import { useEffect, useRef, useState } from 'react'
import { USAGE_REFRESH_INTERVAL_MS } from '@shared/constants'
import type { AppUsageSegment } from '../../../types'
import { isToday } from '../lib/time-utils'

interface AppUsageState {
  segments: AppUsageSegment[]
  loading: boolean
  available: boolean
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
  const shown = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let issued = 0
    let applied = 0

    const load = (): void => {
      const seq = ++issued
      Promise.all([window.electronAPI.getAppUsage(date), window.electronAPI.isAppStateAvailable()])
        .then(([rows, isAvailable]) => {
          if (cancelled || seq < applied) return
          applied = seq
          shown.current = date
          setLoaded({ date, segments: rows, available: isAvailable, error: null })
        })
        .catch((e) => {
          if (cancelled || seq < applied) return
          console.error('Failed to load app usage:', e)
          if (shown.current === date) return
          applied = seq
          shown.current = date
          setLoaded({
            date,
            segments: [],
            available: true,
            error: e instanceof Error ? e.message : 'Could not load app usage'
          })
        })
    }

    load()

    if (!isToday(date)) {
      return () => {
        cancelled = true
      }
    }

    const timer = setInterval(load, USAGE_REFRESH_INTERVAL_MS)
    window.addEventListener('focus', load)

    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener('focus', load)
    }
  }, [date])

  const current = loaded?.date === date ? loaded : null

  return {
    segments: current?.segments ?? [],
    loading: current === null,
    available: current?.available ?? true,
    error: current?.error ?? null
  }
}
