import { SkipBack, Play, Pause, SkipForward } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatTime } from '../lib/time-utils'

const SPEEDS = [1, 2, 5, 10, 30, 60]

interface Props {
  isPlaying: boolean
  speed: number
  currentTimestamp: number | null
  onToggle: () => void
  onSkipForward: () => void
  onSkipBackward: () => void
  onSpeedChange: (speed: number) => void
}

export function PlaybackControls({
  isPlaying,
  speed,
  currentTimestamp,
  onToggle,
  onSkipForward,
  onSkipBackward,
  onSpeedChange
}: Props): React.JSX.Element {
  return (
    <div className="flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" onClick={onSkipBackward}>
            <SkipBack className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Skip back 1 minute</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" onClick={onToggle}>
            {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{isPlaying ? 'Pause' : 'Play'}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" onClick={onSkipForward}>
            <SkipForward className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Skip forward 1 minute</TooltipContent>
      </Tooltip>

      <Select value={String(speed)} onValueChange={(v) => onSpeedChange(Number(v))}>
        <SelectTrigger size="sm" className="w-18 h-7 text-xs rounded-lg">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" side="bottom" align="end">
          {SPEEDS.map((s) => (
            <SelectItem key={s} value={String(s)}>
              {s}x
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {currentTimestamp && (
        <span className="text-xs text-muted-foreground font-mono tabular-nums ml-1">
          {formatTime(currentTimestamp)}
        </span>
      )}
    </div>
  )
}
