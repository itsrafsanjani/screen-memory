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
  const pending = useRef<Map<string, { value: string; timer: ReturnType<typeof setTimeout> }>>(
    new Map()
  )

  const persist = useCallback(async (key: string, value: string): Promise<void> => {
    try {
      await window.electronAPI.setSetting(key, value)
      persisted.current[key] = value
    } catch (error) {
      // Only roll back if nothing newer is queued for this key — otherwise a
      // stale failure would clobber an edit the user has already made since.
      if (!pending.current.has(key)) {
        setSettings((prev) => ({ ...prev, [key]: persisted.current[key] ?? '' }))
      }
      console.error(error)
    }
  }, [])

  const flushAll = useCallback(() => {
    for (const [key, entry] of pending.current) {
      clearTimeout(entry.timer)
      void persist(key, entry.value)
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

      const existing = pending.current.get(key)
      if (existing) clearTimeout(existing.timer)

      const timer = setTimeout(() => {
        pending.current.delete(key)
        void persist(key, value)
      }, PERSIST_DEBOUNCE_MS)
      pending.current.set(key, { value, timer })
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
