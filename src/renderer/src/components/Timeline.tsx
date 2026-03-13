import { TimelineTrack } from './TimelineTrack'
import type { ScreenshotRecord, GitCommit } from '../../../types'
import type { DayBounds } from '../../../types'

interface Props {
  screenshots: ScreenshotRecord[]
  dayBounds: DayBounds | null
  currentTimestamp: number | null
  onSeek: (timestamp: number) => void
  onHoverTimestamp?: (ts: number | null) => void
  gitCommits?: GitCommit[]
}

export function Timeline({
  screenshots,
  dayBounds,
  currentTimestamp,
  onSeek,
  onHoverTimestamp,
  gitCommits
}: Props): React.JSX.Element {
  if (!dayBounds || screenshots.length === 0) {
    return (
      <div className="px-4 py-3">
        <div className="h-8 bg-secondary rounded flex items-center justify-center text-muted-foreground text-sm">
          No data for this day
        </div>
      </div>
    )
  }

  return (
    <div className="py-1">
      <TimelineTrack
        screenshots={screenshots}
        dayBounds={dayBounds}
        currentTimestamp={currentTimestamp}
        onSeek={onSeek}
        onHoverTimestamp={onHoverTimestamp}
        gitCommits={gitCommits}
      />
    </div>
  )
}
