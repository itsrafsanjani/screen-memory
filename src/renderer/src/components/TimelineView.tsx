import type { Dispatch, SetStateAction } from 'react'
import type { DayBounds, GitCommit, ScreenshotRecord } from '../../../types'
import { ScreenshotViewer } from './ScreenshotViewer'
import { Timeline } from './Timeline'
import { DetailSidebar } from './DetailSidebar'

interface Props {
  loading: boolean
  screenshots: ScreenshotRecord[]
  screenshotsWithCommits: ScreenshotRecord[]
  gitCommits: GitCommit[]
  dayBounds: DayBounds | null
  currentTimestamp: number | null
  hoverTimestamp: number | null
  setHoverTimestamp: Dispatch<SetStateAction<number | null>>
  onSeek: (timestamp: number) => void
}

export function TimelineView({
  loading,
  screenshots,
  screenshotsWithCommits,
  gitCommits,
  dayBounds,
  currentTimestamp,
  hoverTimestamp,
  setHoverTimestamp,
  onSeek
}: Props): React.JSX.Element {
  return (
    <>
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          Loading...
        </div>
      ) : (
        <div className="flex-1 flex min-h-0">
          <ScreenshotViewer
            screenshots={screenshots}
            currentTimestamp={currentTimestamp}
            hoverTimestamp={hoverTimestamp}
          />
          <DetailSidebar
            commits={gitCommits}
            currentTimestamp={currentTimestamp}
            screenshots={screenshots}
          />
        </div>
      )}

      <div className="border-t border-border/60 w-full">
        <Timeline
          screenshots={screenshotsWithCommits}
          dayBounds={dayBounds}
          currentTimestamp={currentTimestamp}
          onSeek={onSeek}
          onHoverTimestamp={setHoverTimestamp}
          gitCommits={gitCommits}
        />
      </div>
    </>
  )
}
