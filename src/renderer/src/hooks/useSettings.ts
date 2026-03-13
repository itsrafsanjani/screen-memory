import { useState, useEffect, useCallback } from 'react'

export function useSettings(): {
  settings: Record<string, string>
  loading: boolean
  updateSetting: (key: string, value: string) => Promise<void>
  getSetting: (key: string, defaultValue?: string) => string
} {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.electronAPI
      .getAllSettings()
      .then((s) => {
        setSettings(s)
        setLoading(false)
      })
      .catch(console.error)
  }, [])

  const updateSetting = useCallback(async (key: string, value: string) => {
    await window.electronAPI.setSetting(key, value)
    setSettings((prev) => ({ ...prev, [key]: value }))
  }, [])

  const getSetting = useCallback(
    (key: string, defaultValue = ''): string => {
      return settings[key] ?? defaultValue
    },
    [settings]
  )

  return { settings, loading, updateSetting, getSetting }
}
