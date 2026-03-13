import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Sparkles, Loader2 } from 'lucide-react'
import { useSummary } from '../hooks/useSummary'

interface Props {
  currentDate: string
}

type Period = 'today' | 'yesterday' | 'week'

export function SummaryView({ currentDate }: Props): React.JSX.Element {
  const [period, setPeriod] = useState<Period>('today')
  const { text, loading, error, generate } = useSummary()

  const { startMs, endMs } = useMemo(() => {
    const [year, month, day] = currentDate.split('-').map(Number)
    const dayStart = new Date(year, month - 1, day, 0, 0, 0, 0).getTime()
    const dayEnd = new Date(year, month - 1, day, 23, 59, 59, 999).getTime()

    switch (period) {
      case 'yesterday': {
        const ys = dayStart - 24 * 60 * 60 * 1000
        const ye = dayEnd - 24 * 60 * 60 * 1000
        return { startMs: ys, endMs: ye }
      }
      case 'week': {
        const ws = dayStart - 6 * 24 * 60 * 60 * 1000
        return { startMs: ws, endMs: dayEnd }
      }
      default:
        return { startMs: dayStart, endMs: dayEnd }
    }
  }, [currentDate, period])

  const handleGenerate = (): void => {
    generate(startMs, endMs)
  }

  return (
    <div className="flex-1 flex flex-col p-4 min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Sparkles className="h-4 w-4" />
        <h2 className="text-sm font-medium">AI Summary</h2>
      </div>

      {/* Period selector */}
      <div className="flex items-center gap-2 mb-4">
        {(['today', 'yesterday', 'week'] as const).map((p) => (
          <Button
            key={p}
            variant={period === p ? 'default' : 'outline'}
            size="sm"
            className="text-xs h-7"
            onClick={() => setPeriod(p)}
          >
            {p === 'today' ? 'Today' : p === 'yesterday' ? 'Yesterday' : 'This Week'}
          </Button>
        ))}
      </div>

      {/* Generate button */}
      <div className="mb-4">
        <Button size="sm" onClick={handleGenerate} disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="h-3 w-3 mr-1" />
              Generate Summary
            </>
          )}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Output */}
      <div className="flex-1 overflow-y-auto rounded-md border border-border p-4 bg-card">
        {text ? (
          <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm">
            {text}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Select a time period and click &ldquo;Generate Summary&rdquo; to create an AI-powered
            summary of your work activity.
          </p>
        )}
      </div>
    </div>
  )
}
