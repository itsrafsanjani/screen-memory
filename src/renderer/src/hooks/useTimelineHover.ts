import { useCallback, useState } from 'react'

interface UseTimelineHoverResult {
  hoverX: number | null
  hoverMs: number | null
  setHover: (x: number, ms: number) => void
  clearHover: () => void
}

export function useTimelineHover(): UseTimelineHoverResult {
  const [hoverX, setHoverX] = useState<number | null>(null)
  const [hoverMs, setHoverMs] = useState<number | null>(null)

  const setHover = useCallback((x: number, ms: number): void => {
    setHoverX(x)
    setHoverMs(ms)
  }, [])

  const clearHover = useCallback((): void => {
    setHoverX(null)
    setHoverMs(null)
  }, [])

  return { hoverX, hoverMs, setHover, clearHover }
}
