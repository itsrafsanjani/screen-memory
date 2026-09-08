import { useEffect, useState } from 'react'

export interface UseStorageUsageResult {
  bytes: number | null
  loading: boolean
}

export function useStorageUsage(): UseStorageUsageResult {
  const [bytes, setBytes] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    window.electronAPI
      .getStorageUsage()
      .then((value) => {
        if (!cancelled) setBytes(value)
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { bytes, loading }
}
