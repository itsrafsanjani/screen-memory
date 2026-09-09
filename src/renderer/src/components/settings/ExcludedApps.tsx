import { useEffect, useMemo, useState } from 'react'
import { FolderSearch, X } from 'lucide-react'
import type { ExcludedApp, RunningApp } from '../../../../types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

interface Props {
  getSetting: (key: string, defaultValue?: string) => string
  updateSetting: (key: string, value: string) => Promise<void>
}

const DEFAULT_THRESHOLD = '80'

function parseExcluded(raw: string): ExcludedApp[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (e): e is ExcludedApp => !!e && typeof e === 'object' && typeof e.bundleId === 'string'
    )
  } catch {
    return []
  }
}

export function ExcludedApps({ getSetting, updateSetting }: Props): React.JSX.Element {
  const [available, setAvailable] = useState(true)
  const [runningApps, setRunningApps] = useState<RunningApp[]>([])
  const [error, setError] = useState<string | null>(null)
  const [threshold, setThreshold] = useState<string | null>(null)

  const savedThreshold = getSetting('capture.exclusionCoverageThreshold', DEFAULT_THRESHOLD)

  const excluded = useMemo(
    () => parseExcluded(getSetting('capture.excludedApps', '[]')),
    [getSetting]
  )

  useEffect(() => {
    let cancelled = false
    let issued = 0
    let applied = 0

    const load = (): void => {
      const seq = ++issued
      window.electronAPI
        .isAppStateAvailable()
        .then((isAvailable) => {
          if (cancelled || seq < applied) return
          applied = seq
          setAvailable(isAvailable)
          if (!isAvailable) return
          return window.electronAPI.getRunningApps().then((apps) => {
            if (!cancelled && seq >= applied) setRunningApps(apps)
          })
        })
        .catch((e) => {
          console.error(e)
          if (!cancelled && seq >= applied) {
            applied = seq
            setAvailable(false)
          }
        })
    }

    load()

    window.addEventListener('focus', load)

    return () => {
      cancelled = true
      window.removeEventListener('focus', load)
    }
  }, [])

  const save = (next: ExcludedApp[]): void => {
    void updateSetting('capture.excludedApps', JSON.stringify(next))
  }

  const add = (app: ExcludedApp): void => {
    if (excluded.some((e) => e.bundleId === app.bundleId)) return
    save([...excluded, app])
  }

  const remove = (bundleId: string): void => {
    save(excluded.filter((e) => e.bundleId !== bundleId))
  }

  const handleBrowse = async (): Promise<void> => {
    setError(null)
    try {
      const picked = await window.electronAPI.pickApplication()
      if (picked) add(picked)
      else setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that application')
    }
  }

  const addable = runningApps.filter((a) => !excluded.some((e) => e.bundleId === a.bundleId))

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Excluded Apps</Label>
        <p className="text-xs text-muted-foreground">
          {available
            ? 'A screen is skipped while one of these apps is its frontmost window and covers at least the share below. Other screens keep recording.'
            : 'App detection is unavailable on this system, so exclusions cannot be applied.'}
        </p>
      </div>

      {excluded.length > 0 ? (
        <ul className="space-y-1">
          {excluded.map((app) => (
            <li
              key={app.bundleId}
              className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2.5 py-1.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm">{app.name}</p>
                <p className="truncate text-xs text-muted-foreground">{app.bundleId}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 shrink-0"
                onClick={() => remove(app.bundleId)}
                title={`Remove ${app.name}`}
              >
                <X className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No apps are excluded.</p>
      )}

      <div className="flex items-center gap-2">
        <Select
          value=""
          disabled={!available || addable.length === 0}
          onValueChange={(bundleId) => {
            const app = addable.find((a) => a.bundleId === bundleId)
            if (app) add(app)
          }}
        >
          <SelectTrigger size="sm" className="flex-1">
            <SelectValue placeholder="Add a running app…" />
          </SelectTrigger>
          <SelectContent>
            {addable.map((app) => (
              <SelectItem key={app.bundleId} value={app.bundleId}>
                {app.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          variant="outline"
          size="sm"
          disabled={!available}
          onClick={() => void handleBrowse()}
        >
          <FolderSearch className="size-3.5" />
          Browse…
        </Button>
      </div>

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <div className="space-y-2">
        <Label htmlFor="exclusion-coverage">Screen Coverage (%)</Label>
        <Input
          id="exclusion-coverage"
          type="number"
          min="1"
          max="100"
          disabled={!available}
          value={threshold ?? savedThreshold}
          onChange={(e) => setThreshold(e.target.value)}
          onBlur={() => {
            const draft = threshold
            setThreshold(null)
            if (draft === null || draft.trim() === '') return
            const parsed = Number(draft)
            if (!Number.isFinite(parsed)) return
            void updateSetting(
              'capture.exclusionCoverageThreshold',
              String(Math.min(100, Math.max(1, Math.round(parsed))))
            )
          }}
          className="w-24"
        />
        <p className="text-xs text-muted-foreground">
          An excluded app is skipped on a display when it&apos;s the frontmost window there and
          covers at least this much of the screen. 80% catches maximized and near-fullscreen windows
          as well as true fullscreen.
        </p>
      </div>
    </div>
  )
}
