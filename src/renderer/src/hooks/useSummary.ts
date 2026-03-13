import { useState, useCallback, useEffect, useRef } from 'react'

export function useSummary(): {
  text: string
  loading: boolean
  error: string | null
  generate: (startMs: number, endMs: number) => Promise<void>
} {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cleanupRef = useRef<(() => void)[]>([])

  useEffect(() => {
    return () => {
      for (const cleanup of cleanupRef.current) cleanup()
    }
  }, [])

  const generate = useCallback(async (startMs: number, endMs: number) => {
    // Clean up previous listeners
    for (const cleanup of cleanupRef.current) cleanup()
    cleanupRef.current = []

    setText('')
    setError(null)
    setLoading(true)

    const unsubChunk = window.electronAPI.onSummaryChunk((chunk) => {
      setText((prev) => prev + chunk)
    })
    const unsubDone = window.electronAPI.onSummaryDone(() => {
      setLoading(false)
    })
    const unsubError = window.electronAPI.onSummaryError((err) => {
      setError(err)
      setLoading(false)
    })

    cleanupRef.current = [unsubChunk, unsubDone, unsubError]

    try {
      await window.electronAPI.generateSummary(startMs, endMs)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate summary')
      setLoading(false)
    }
  }, [])

  return { text, loading, error, generate }
}
