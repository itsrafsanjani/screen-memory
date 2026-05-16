import { useEffect, useState } from 'react'

export function useOcrText(screenshotId: number | null): string | null {
  const [state, setState] = useState<{ id: number | null; text: string | null }>({
    id: screenshotId,
    text: null
  })

  if (state.id !== screenshotId) {
    setState({ id: screenshotId, text: null })
  }

  useEffect(() => {
    if (screenshotId === null) return

    let cancelled = false
    window.electronAPI
      .getOcrText(screenshotId)
      .then((value) => {
        if (!cancelled) {
          setState((prev) => (prev.id === screenshotId ? { id: screenshotId, text: value } : prev))
        }
      })
      .catch(() => {
        // leave text as null
      })

    return () => {
      cancelled = true
    }
  }, [screenshotId])

  return state.text
}
