import { useState, useCallback, useRef } from 'react'
import type { OcrSearchResult } from '../../../types'

export function useSearch(): {
  query: string
  results: OcrSearchResult[]
  searching: boolean
  search: (q: string) => void
  clearSearch: () => void
} {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<OcrSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const search = useCallback((q: string) => {
    setQuery(q)

    if (timerRef.current) clearTimeout(timerRef.current)

    if (!q.trim()) {
      setResults([])
      setSearching(false)
      return
    }

    setSearching(true)
    timerRef.current = setTimeout(async () => {
      try {
        const r = await window.electronAPI.searchOcr(q.trim())
        setResults(r)
      } catch (err) {
        console.error('Search failed:', err)
      }
      setSearching(false)
    }, 300)
  }, [])

  const clearSearch = useCallback(() => {
    setQuery('')
    setResults([])
    setSearching(false)
  }, [])

  return { query, results, searching, search, clearSearch }
}
