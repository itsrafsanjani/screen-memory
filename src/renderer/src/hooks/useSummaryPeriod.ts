import { useMemo, useState } from 'react'
import { endOfDay, parse, startOfDay, subDays } from 'date-fns'

export type SummaryPeriod = 'today' | 'yesterday' | 'week' | 'custom'

interface UseSummaryPeriodResult {
  period: SummaryPeriod
  setPeriod: (p: SummaryPeriod) => void
  customDate: Date | undefined
  setCustomDate: (d: Date | undefined) => void
  popoverOpen: boolean
  setPopoverOpen: (open: boolean) => void
  startMs: number
  endMs: number
}

export function useSummaryPeriod(currentDate: string): UseSummaryPeriodResult {
  const [period, setPeriod] = useState<SummaryPeriod>('today')
  const [customDate, setCustomDate] = useState<Date | undefined>()
  const [popoverOpen, setPopoverOpen] = useState(false)

  const { startMs, endMs } = useMemo(() => {
    if (period === 'custom' && customDate) {
      return {
        startMs: startOfDay(customDate).getTime(),
        endMs: endOfDay(customDate).getTime()
      }
    }

    const baseDate = parse(currentDate, 'yyyy-MM-dd', new Date())

    switch (period) {
      case 'yesterday':
        return {
          startMs: startOfDay(subDays(baseDate, 1)).getTime(),
          endMs: endOfDay(subDays(baseDate, 1)).getTime()
        }
      case 'week':
        return {
          startMs: startOfDay(subDays(baseDate, 6)).getTime(),
          endMs: endOfDay(baseDate).getTime()
        }
      case 'today':
      case 'custom':
      default:
        return {
          startMs: startOfDay(baseDate).getTime(),
          endMs: endOfDay(baseDate).getTime()
        }
    }
  }, [currentDate, period, customDate])

  return {
    period,
    setPeriod,
    customDate,
    setCustomDate,
    popoverOpen,
    setPopoverOpen,
    startMs,
    endMs
  }
}
