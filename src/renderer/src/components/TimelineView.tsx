import { useMemo, type Dispatch, type SetStateAction } from 'react'
import type { DayBounds, GitCommit, ScreenshotRecord } from '../../../types'
import type { DisplayOption } from '../hooks/useDisplayFilter'
import { ScreenshotViewer } from './ScreenshotViewer'
import { Timeline } from './Timeline'
import { DetailSidebar } from './DetailSidebar'
import { RangeDeleteBar } from './RangeDeleteBar'
import type { RangeSelection } from '../hooks/useRangeSelection'

interface Props {
  loading: boolean
  screenshots: ScreenshotRecord[]
  displays: DisplayOption[]
  screenshotsWithCommits: ScreenshotRecord[]
  gitCommits: GitCommit[]
  dayBounds: DayBounds | null
  currentTimestamp: number | null
  hoverTimestamp: number | null
  setHoverTimestamp: Dispatch<SetStateAction<number | null>>
  onSeek: (timestamp: number) => void
  selectMode: boolean
  selection: RangeSelection | null
  onSelectionChange: (selection: RangeSelection | null) => void
  onCancelSelection: () => void
  onDeleteRange: (start: number, end: number) => Promise<void>
  onLightboxOpenChange: (open: boolean) => void
}

export function TimelineView({
  loading,
  screenshots,
  displays,
  screenshotsWithCommits,
  gitCommits,
  dayBounds,
  currentTimestamp,
  hoverTimestamp,
  setHoverTimestamp,
  onSeek,
  selectMode,
  selection,
  onSelectionChange,
  onCancelSelection,
  onDeleteRange,
  onLightboxOpenChange
}: Props): React.JSX.Element {
  const selectedCount = useMemo(() => {
    if (!selection) return 0
    return screenshots.filter(
      (s) => s.timestamp >= selection.startMs && s.timestamp <= selection.endMs
    ).length
  }, [screenshots, selection])

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
            displays={displays}
            currentTimestamp={currentTimestamp}
            hoverTimestamp={hoverTimestamp}
            onLightboxOpenChange={onLightboxOpenChange}
          />
          <DetailSidebar
            commits={gitCommits}
            currentTimestamp={currentTimestamp}
            screenshots={screenshots}
          />
        </div>
      )}

      <div className="border-t border-border/60 w-full">
        {selection ? (
          <RangeDeleteBar
            selection={selection}
            screenshotCount={selectedCount}
            onCancel={onCancelSelection}
            onConfirm={onDeleteRange}
          />
        ) : null}
        <Timeline
          screenshots={screenshotsWithCommits}
          dayBounds={dayBounds}
          currentTimestamp={currentTimestamp}
          onSeek={onSeek}
          onHoverTimestamp={setHoverTimestamp}
          gitCommits={gitCommits}
          selectMode={selectMode}
          selection={selection}
          onSelectionChange={onSelectionChange}
        />
      </div>
    </>
  )
}
