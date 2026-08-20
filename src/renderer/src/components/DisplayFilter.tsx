import { MonitorSmartphone } from 'lucide-react'
import type { DisplayOption } from '../hooks/useDisplayFilter'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

const ALL_VALUE = '__all__'

interface Props {
  displays: DisplayOption[]
  selectedDisplayId: string | null
  onChange: (displayId: string | null) => void
}

/**
 * Persistent screen filter. Rendered only on multi-monitor days, with a fixed
 * width so appearing and disappearing doesn't nudge the centered day picker.
 */
export function DisplayFilter({
  displays,
  selectedDisplayId,
  onChange
}: Props): React.JSX.Element | null {
  if (displays.length < 2) return null

  const value = displays.some((d) => d.id === selectedDisplayId)
    ? (selectedDisplayId as string)
    : ALL_VALUE

  return (
    <Select value={value} onValueChange={(next) => onChange(next === ALL_VALUE ? null : next)}>
      <SelectTrigger size="sm" className="no-drag h-7 w-[9.5rem]" aria-label="Filter by screen">
        <MonitorSmartphone className="size-3 opacity-60" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_VALUE}>All screens</SelectItem>
        {displays.map((display) => (
          <SelectItem key={display.id} value={display.id}>
            {display.label}
            {display.width && display.height ? (
              <span className="text-muted-foreground text-xs">
                {display.width}×{display.height}
              </span>
            ) : null}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
