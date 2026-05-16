import { useState } from 'react'
import { format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sparkles, Loader2, CalendarIcon, Copy, Check } from 'lucide-react'
import { useSummary } from '../hooks/useSummary'
import { useSummaryPeriod, type SummaryPeriod } from '../hooks/useSummaryPeriod'

interface Props {
  currentDate: string
}

const PRESET_PERIODS = ['today', 'yesterday', 'week'] as const
type PresetPeriod = (typeof PRESET_PERIODS)[number]

const PRESET_LABELS: Record<PresetPeriod, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  week: 'This Week'
}

const COPY_RESET_MS = 2000

export function SummaryView({ currentDate }: Props): React.JSX.Element {
  const {
    period,
    setPeriod,
    customDate,
    setCustomDate,
    popoverOpen,
    setPopoverOpen,
    startMs,
    endMs
  } = useSummaryPeriod(currentDate)
  const [copied, setCopied] = useState(false)
  const { text, loading, error, generate } = useSummary()

  const handleGenerate = (): void => {
    setCopied(false)
    void generate(startMs, endMs)
  }

  const handleCopy = async (): Promise<void> => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), COPY_RESET_MS)
    } catch {
      // Clipboard may be unavailable in restricted contexts
    }
  }

  const customLabel =
    period === 'custom' && customDate ? format(customDate, 'MMM d, yyyy') : 'Pick Date'

  return (
    <div className="flex-1 flex flex-col p-4 min-h-0">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Sparkles className="h-4 w-4" />
        <h2 className="text-sm font-medium">AI Summary</h2>
      </div>

      {/* Period selector */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {PRESET_PERIODS.map((preset) => (
          <Button
            key={preset}
            variant={period === preset ? 'default' : 'outline'}
            size="sm"
            className="text-xs h-7"
            onClick={() => setPeriod(preset as SummaryPeriod)}
          >
            {PRESET_LABELS[preset]}
          </Button>
        ))}
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              variant={period === 'custom' ? 'default' : 'outline'}
              size="sm"
              className="text-xs h-7"
            >
              <CalendarIcon className="h-3 w-3 mr-1" />
              {customLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={customDate}
              onSelect={(date) => {
                setCustomDate(date)
                setPeriod('custom')
                setPopoverOpen(false)
              }}
              autoFocus
            />
          </PopoverContent>
        </Popover>
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
      {error ? (
        <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      ) : null}

      {/* Output */}
      <div className="flex-1 flex flex-col min-h-0 rounded-md border border-border bg-card overflow-hidden">
        {text ? (
          <>
            <div className="flex justify-end shrink-0 border-b border-border px-3 py-2">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => void handleCopy()}
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 mr-1" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </>
                )}
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap text-sm">
                {text}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto p-4">
            <p className="text-sm text-muted-foreground">
              Select a time period and click &ldquo;Generate Summary&rdquo; to create an AI-powered
              summary of your work activity.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
