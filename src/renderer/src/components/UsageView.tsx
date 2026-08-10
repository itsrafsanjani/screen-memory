import { useMemo } from 'react'
import { Clock, TriangleAlert } from 'lucide-react'
import type { AppUsageSegment } from '../../../types'
import { useAppUsage } from '../hooks/useAppUsage'
import { formatDuration } from '../lib/format'

interface Props {
  currentDate: string
}

interface AppTotal {
  bundleId: string
  name: string
  durationMs: number
}

// Written out rather than built from a template so Tailwind keeps the classes.
const USAGE_COLORS = [
  'bg-usage-1',
  'bg-usage-2',
  'bg-usage-3',
  'bg-usage-4',
  'bg-usage-5',
  'bg-usage-6',
  'bg-usage-7',
  'bg-usage-8'
] as const

const HOURS = Array.from({ length: 24 }, (_, i) => i)

/** Stable per-app color: the same app keeps its color across days and reloads. */
function colorFor(bundleId: string): string {
  let hash = 0
  for (let i = 0; i < bundleId.length; i++) {
    hash = (hash * 31 + bundleId.charCodeAt(i)) | 0
  }
  return USAGE_COLORS[Math.abs(hash) % USAGE_COLORS.length]
}

function dayBounds(dateStr: string): { start: number; end: number } {
  const [year, month, day] = dateStr.split('-').map(Number)
  return {
    start: new Date(year, month - 1, day, 0, 0, 0, 0).getTime(),
    end: new Date(year, month - 1, day, 23, 59, 59, 999).getTime()
  }
}

function startOfNextHour(timestamp: number): number {
  const d = new Date(timestamp)
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  return d.getTime()
}

function hourLabel(hour: number): string {
  if (hour === 0) return '12a'
  if (hour === 12) return '12p'
  return hour < 12 ? `${hour}a` : `${hour - 12}p`
}

/**
 * Totals and per-hour buckets for the day. Segments are clamped to the day, so
 * one that straddles midnight only contributes the part that falls inside it.
 */
function summarize(
  segments: AppUsageSegment[],
  start: number,
  end: number
): { totals: AppTotal[]; totalMs: number; buckets: Map<string, number>[] } {
  const byApp = new Map<string, AppTotal>()
  const buckets: Map<string, number>[] = HOURS.map(() => new Map())

  for (const segment of segments) {
    const from = Math.max(segment.started_at, start)
    const to = Math.min(segment.ended_at, end)
    if (to <= from) continue

    const existing = byApp.get(segment.bundle_id)
    if (existing) {
      existing.durationMs += to - from
    } else {
      byApp.set(segment.bundle_id, {
        bundleId: segment.bundle_id,
        name: segment.app_name,
        durationMs: to - from
      })
    }

    let cursor = from
    while (cursor < to) {
      const hour = new Date(cursor).getHours()
      const next = Math.min(to, startOfNextHour(cursor))
      const bucket = buckets[hour]
      bucket.set(segment.bundle_id, (bucket.get(segment.bundle_id) ?? 0) + (next - cursor))
      cursor = next
    }
  }

  const totals = [...byApp.values()].sort((a, b) => b.durationMs - a.durationMs)
  return {
    totals,
    totalMs: totals.reduce((sum, t) => sum + t.durationMs, 0),
    buckets
  }
}

export function UsageView({ currentDate }: Props): React.JSX.Element {
  const { segments, loading, available, error } = useAppUsage(currentDate)

  const { totals, totalMs, buckets } = useMemo(() => {
    const { start, end } = dayBounds(currentDate)
    return summarize(segments, start, end)
  }, [segments, currentDate])

  const nameFor = useMemo(() => new Map(totals.map((t) => [t.bundleId, t.name])), [totals])

  const busiestHourMs = useMemo(
    () => Math.max(1, ...buckets.map((b) => [...b.values()].reduce((sum, ms) => sum + ms, 0))),
    [buckets]
  )

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center max-w-sm">
          <TriangleAlert className="size-12 mx-auto mb-3 opacity-20" />
          <p>Could not load app usage for this day</p>
          <p className="text-sm mt-1 text-destructive">{error}</p>
        </div>
      </div>
    )
  }

  if (totals.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center max-w-sm">
          <Clock className="size-12 mx-auto mb-3 opacity-20" />
          <p>No app usage recorded for this day</p>
          <p className="text-sm mt-1">
            {available
              ? 'Usage is tracked while you work, and idle time is left out.'
              : 'The app usage helper is not installed, so time tracking is turned off.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">Tracked time</p>
          <p className="text-3xl font-semibold tabular-nums">{formatDuration(totalMs)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Across {totals.length} {totals.length === 1 ? 'app' : 'apps'}. Idle time is not counted.
          </p>
        </div>

        {/* Hour-by-hour strip, each column stacked by app */}
        <div>
          <p className="text-sm font-medium mb-2">By hour</p>
          <div className="flex items-end gap-[3px] h-24">
            {buckets.map((bucket, hour) => {
              const hourMs = [...bucket.values()].reduce((sum, ms) => sum + ms, 0)
              const entries = [...bucket.entries()].sort((a, b) => b[1] - a[1])
              return (
                <div
                  key={hour}
                  className="flex-1 flex flex-col justify-end h-full"
                  title={`${hourLabel(hour)} — ${formatDuration(hourMs)}`}
                >
                  <div
                    className="flex flex-col-reverse overflow-hidden rounded-sm"
                    style={{ height: `${(hourMs / busiestHourMs) * 100}%` }}
                  >
                    {entries.map(([bundleId, ms]) => (
                      <div
                        key={bundleId}
                        // A hairline of page background on the leading edge of
                        // every band. Two apps that hash to neighbouring hues
                        // otherwise read as one block. Drawn as an inset shadow
                        // rather than a border so it costs the band no height.
                        className={`${colorFor(bundleId)} shadow-[inset_0_1px_0_0_var(--background)]`}
                        style={{ height: `${(ms / hourMs) * 100}%` }}
                        title={`${nameFor.get(bundleId) ?? bundleId} — ${formatDuration(ms)}`}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex gap-[3px] mt-1">
            {HOURS.map((hour) => (
              <div key={hour} className="flex-1 text-center text-[10px] text-muted-foreground">
                {hour % 3 === 0 ? hourLabel(hour) : ''}
              </div>
            ))}
          </div>
        </div>

        {/* Ranked apps */}
        <div className="space-y-2">
          <p className="text-sm font-medium">By app</p>
          {totals.map((app) => {
            const share = totalMs > 0 ? (app.durationMs / totalMs) * 100 : 0
            return (
              <div key={app.bundleId} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate" title={app.bundleId}>
                    {app.name}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {formatDuration(app.durationMs)}
                    <span className="ml-2 text-xs">{Math.round(share)}%</span>
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={`h-full rounded-full ${colorFor(app.bundleId)}`}
                    style={{ width: `${share}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
