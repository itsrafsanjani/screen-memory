import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDateDisplay } from '../lib/time-utils'

interface Props {
  currentDate: string
  hasPrevious: boolean
  hasNext: boolean
  onPrevious: () => void
  onNext: () => void
}

export function DayPicker({
  currentDate,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext
}: Props): React.JSX.Element {
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon-sm" onClick={onPrevious} disabled={!hasPrevious}>
        <ChevronLeft className="size-4" />
      </Button>
      <span className="text-sm font-medium text-foreground min-w-[100px] text-center">
        {formatDateDisplay(currentDate)}
      </span>
      <Button variant="ghost" size="icon-sm" onClick={onNext} disabled={!hasNext}>
        <ChevronRight className="size-4" />
      </Button>
    </div>
  )
}
