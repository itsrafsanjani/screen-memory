import { useEffect, useRef, useState } from 'react'
import { USAGE_REFRESH_INTERVAL_MS } from '@shared/constants'
import type { AppUsageSegment } from '../../../types'
import { isToday } from '../lib/time-utils'

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

/**
 * Today's usage keeps accruing while the view is open: `UsageService` grows the
 * open segment every couple of seconds. The window is hidden and shown from the
 * tray rather than remounted, so without the refresh below an open Usage view
 * shows whatever was true when it was first opened, indefinitely.
 */
export function useAppUsage(date: string): AppUsageState {
  const [loaded, setLoaded] = useState<LoadedDay | null>(null)
  // The date currently on screen. Read from a callback rather than from `loaded`
  // so the effect below does not have to re-run — and therefore re-subscribe —
  // every time a refresh lands.
  const shown = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    // A refresh can overlap the one before it — the interval and a window focus
    // can fire together — and the two are not guaranteed to land in order, so
    // only the newest response may be applied.
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
          // A background refresh that fails must not throw away a good view, and
          // must not count as applied either: a slower request still in flight
          // can still supersede it. Claiming the slot here would discard that
          // response and leave the day stranded until the next interval.
          if (shown.current === date) return
          applied = seq
          shown.current = date
          // A failed read is not an idle day. Reporting it as one would tell the
          // user their time simply wasn't tracked, which is worse than an error.
          setLoaded({
            date,
            segments: [],
            available: true,
            error: e instanceof Error ? e.message : 'Could not load app usage'
          })
        })
    }

    load()

    // Every earlier day is finished and can no longer change, so it is read once.
    if (!isToday(date)) {
      return () => {
        cancelled = true
      }
    }

    const timer = setInterval(load, USAGE_REFRESH_INTERVAL_MS)
    // Coming back from the tray should not cost up to a full interval before
    // the numbers catch up.
    window.addEventListener('focus', load)

    return () => {
      cancelled = true
      clearInterval(timer)
      window.removeEventListener('focus', load)
    }
  }, [date])

  // Tagging the result with its date is what makes `loading` derivable: the
  // previous day's segments never show up while the new day is still loading.
  // A refresh replaces the day in place, so it never flips back to loading.
  const current = loaded?.date === date ? loaded : null

  return {
    segments: current?.segments ?? [],
    loading: current === null,
    available: current?.available ?? true,
    error: current?.error ?? null
  }
}
