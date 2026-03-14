import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { OcrSearchResult } from '../../../types'
import { formatTimeShort } from '../lib/time-utils'

interface Props {
  query: string
  results: OcrSearchResult[]
  searching: boolean
  onSearch: (query: string) => void
  onClear: () => void
  onResultClick: (timestamp: number) => void
}

export function SearchBar({
  query,
  results,
  searching,
  onSearch,
  onClear,
  onResultClick
}: Props): React.JSX.Element {
  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
          <Input
            placeholder="Search screen text..."
            className="h-7 w-48 pl-7 text-xs rounded-lg"
            value={query}
            onChange={(e) => onSearch(e.target.value)}
          />
          {query && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-0 top-0 h-7 w-7"
              onClick={onClear}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Search results dropdown */}
      {query && results.length > 0 && (
        <div className="absolute top-full right-0 mt-1 w-72 max-h-60 overflow-y-auto rounded-lg border border-border bg-popover shadow-lg z-50">
          {searching && <div className="p-2 text-xs text-muted-foreground">Searching...</div>}
          {results.map((r, i) => (
            <button
              key={i}
              className="w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors border-b border-border last:border-0"
              onClick={() => onResultClick(r.timestamp)}
            >
              <div className="text-muted-foreground mb-0.5">{formatTimeShort(r.timestamp)}</div>
              <div className="line-clamp-2">{r.text_snippet.slice(0, 100)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
