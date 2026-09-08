import { useState, useEffect, useCallback, useRef } from 'react'

const PERSIST_DEBOUNCE_MS = 400

export function useSettings(): {
  settings: Record<string, string>
  loading: boolean
  updateSetting: (key: string, value: string) => Promise<void>
  getSetting: (key: string, defaultValue?: string) => string
} {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const persisted = useRef<Record<string, string>>({})

  // Debounced writes keyed by setting key, so rapid edits (e.g. typing in a
  // textarea) coalesce into a single SQLite write instead of one per keystroke.
  const pending = useRef<
    Map<string, { value: string; timer: ReturnType<typeof setTimeout>; revision: number }>
  >(new Map())

  // The revision a key was last scheduled at, bumped on every edit. Lets a
  // failed persist tell whether it's still the newest write attempted for
  // that key, even after a newer write has already left `pending` to start
  // its own in-flight request.
  const revision = useRef<Map<string, number>>(new Map())

  const persist = useCallback(async (key: string, value: string, rev: number): Promise<void> => {
    try {
      await window.electronAPI.setSetting(key, value)
      persisted.current[key] = value
    } catch (error) {
      if (revision.current.get(key) === rev) {
        setSettings((prev) => ({ ...prev, [key]: persisted.current[key] ?? '' }))
      }
      console.error(error)
    }
  }, [])

  const flushAll = useCallback(() => {
    for (const [key, entry] of pending.current) {
      clearTimeout(entry.timer)
      void persist(key, entry.value, entry.revision)
    }
    pending.current.clear()
  }, [persist])

  useEffect(() => {
    window.electronAPI
      .getAllSettings()
      .then((s) => {
        persisted.current = { ...s }
        setSettings(s)
        setLoading(false)
      })
      .catch(console.error)
  }, [])

  // Persist any pending edits before the window unloads or the hook unmounts,
  // since the main process reads settings straight from the DB.
  useEffect(() => {
    window.addEventListener('beforeunload', flushAll)
    return () => {
      window.removeEventListener('beforeunload', flushAll)
      flushAll()
    }
  }, [flushAll])

  const updateSetting = useCallback(
    async (key: string, value: string) => {
      // Optimistic in-memory update keeps controlled inputs responsive.
      setSettings((prev) => ({ ...prev, [key]: value }))

      const rev = (revision.current.get(key) ?? 0) + 1
      revision.current.set(key, rev)

      const existing = pending.current.get(key)
      if (existing) clearTimeout(existing.timer)

      const timer = setTimeout(() => {
        pending.current.delete(key)
        void persist(key, value, rev)
      }, PERSIST_DEBOUNCE_MS)
      pending.current.set(key, { value, timer, revision: rev })
    },
    [persist]
  )

  const getSetting = useCallback(
    (key: string, defaultValue = ''): string => {
      return settings[key] ?? defaultValue
    },
    [settings]
  )

  return { settings, loading, updateSetting, getSetting }
}
