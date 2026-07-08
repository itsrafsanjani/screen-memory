import { useState, useCallback } from 'react'

export interface RangeSelection {
  startMs: number
  endMs: number
}

export interface UseRangeSelectionReturn {
  selectMode: boolean
  toggleSelectMode: () => void
  setSelectMode: (on: boolean) => void
  selection: RangeSelection | null
  setSelection: (sel: RangeSelection | null) => void
  clearSelection: () => void
}

export function useRangeSelection(): UseRangeSelectionReturn {
  const [selectMode, setSelectModeState] = useState(false)
  const [selection, setSelection] = useState<RangeSelection | null>(null)

  const clearSelection = useCallback(() => setSelection(null), [])

  const setSelectMode = useCallback((on: boolean) => {
    setSelectModeState(on)
    if (!on) setSelection(null)
  }, [])

  const toggleSelectMode = useCallback(() => {
    setSelectModeState((prev) => {
      if (prev) setSelection(null)
      return !prev
    })
  }, [])

  return {
    selectMode,
    toggleSelectMode,
    setSelectMode,
    selection,
    setSelection,
    clearSelection
  }
}
