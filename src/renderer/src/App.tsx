import { useEffect, useMemo, useState } from 'react'
import { useTimeline } from './hooks/useTimeline'
import { usePlayback } from './hooks/usePlayback'
import { useGitCommits } from './hooks/useGitCommits'
import { useSearch } from './hooks/useSearch'
import { useTheme } from './hooks/useTheme'
import { useCaptureStatus } from './hooks/useCaptureStatus'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useMigrationStatus } from './hooks/useMigrationStatus'
import { DayPicker } from './components/DayPicker'
import { PlaybackControls } from './components/PlaybackControls'
import { SearchBar } from './components/SearchBar'
import { SettingsDialog } from './components/Settings'
import { SummaryView } from './components/SummaryView'
import { TimelineView } from './components/TimelineView'
import { MigrationOverlay } from './components/MigrationOverlay'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import { Settings, Sparkles, Monitor } from 'lucide-react'
import type { ScreenshotRecord } from '../../types'

type ViewMode = 'timeline' | 'summary'

function gitCommitsToScreenshotEntries(
  commits: ReturnType<typeof useGitCommits>
): ScreenshotRecord[] {
  return commits.map((c) => ({
    id: -c.id,
    timestamp: c.timestamp,
    display_id: 'git-commit',
    file_path: '',
    width: 0,
    height: 0,
    file_size: 0,
    is_idle: false
  }))
}

function App(): React.JSX.Element {
  const {
    currentDate,
    currentTimestamp,
    setCurrentTimestamp,
    screenshots,
    dayBounds,
    loading,
    goToPreviousDate,
    goToNextDate,
    hasPreviousDate,
    hasNextDate
  } = useTimeline()

  const gitCommits = useGitCommits(currentDate)

  const screenshotsWithCommits = useMemo(() => {
    if (gitCommits.length === 0) return screenshots
    const commitEntries = gitCommitsToScreenshotEntries(gitCommits)
    return [...screenshots, ...commitEntries].sort((a, b) => a.timestamp - b.timestamp)
  }, [screenshots, gitCommits])

  const {
    isPlaying,
    speed,
    toggle,
    skipForward,
    skipBackward,
    setSpeed,
    cycleSpeedUp,
    cycleSpeedDown
  } = usePlayback(screenshotsWithCommits, currentTimestamp, setCurrentTimestamp)

  const [hoverTimestamp, setHoverTimestamp] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('timeline')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const { query, results, searching, search, clearSearch } = useSearch()
  const { isRecording, toggleRecording } = useCaptureStatus()

  const migration = useMigrationStatus()

  useTheme()
  useKeyboardShortcuts({ toggle, skipForward, skipBackward, cycleSpeedUp, cycleSpeedDown })

  useEffect(() => {
    return window.electronAPI.onOpenSettings(() => setSettingsOpen(true))
  }, [])

  const handleSearchResultClick = (timestamp: number): void => {
    setCurrentTimestamp(timestamp)
    clearSearch()
  }

  const recordingBadgeClass = isRecording
    ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400'
    : ''
  const recordingDotClass = isRecording ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground/40'

  return (
    <TooltipProvider>
      <div className="h-screen flex flex-col bg-background">
        {/* Toolbar */}
        <div className="drag-region relative flex items-center justify-between pl-[80px] pr-4 py-2.5 border-b border-border/60">
          <div className="flex items-center gap-3">
            <Badge
              variant="secondary"
              className={`no-drag cursor-pointer px-2.5 py-1 ${recordingBadgeClass}`}
              onClick={() => void toggleRecording()}
              asChild
            >
              <button>
                <span className={`w-1.5 h-1.5 rounded-full ${recordingDotClass}`} />
                {isRecording ? 'Recording' : 'Paused'}
              </button>
            </Badge>

            {/* View mode toggle — segmented control */}
            <div className="no-drag flex items-center bg-secondary rounded-lg p-0.5 gap-0.5">
              <Button
                variant="ghost"
                size="sm"
                className={`h-6 px-2.5 ${viewMode === 'timeline' ? 'bg-background shadow-sm rounded-md' : ''}`}
                onClick={() => setViewMode('timeline')}
                title="Timeline"
              >
                <Monitor className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={`h-6 px-2.5 ${viewMode === 'summary' ? 'bg-background shadow-sm rounded-md' : ''}`}
                onClick={() => setViewMode('summary')}
                title="AI Summary"
              >
                <Sparkles className="h-3 w-3" />
              </Button>
            </div>
          </div>

          <div className="no-drag absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <DayPicker
              currentDate={currentDate}
              hasPrevious={hasPreviousDate}
              hasNext={hasNextDate}
              onPrevious={goToPreviousDate}
              onNext={goToNextDate}
            />
          </div>

          <div className="no-drag flex items-center gap-2">
            {viewMode === 'timeline' ? (
              <>
                <SearchBar
                  query={query}
                  results={results}
                  searching={searching}
                  onSearch={search}
                  onClear={clearSearch}
                  onResultClick={handleSearchResultClick}
                />
                <PlaybackControls
                  isPlaying={isPlaying}
                  speed={speed}
                  currentTimestamp={currentTimestamp}
                  onToggle={toggle}
                  onSkipForward={skipForward}
                  onSkipBackward={skipBackward}
                  onSpeedChange={setSpeed}
                />
              </>
            ) : null}
            <Separator orientation="vertical" className="h-5" />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 rounded-full"
              onClick={() => setSettingsOpen(true)}
              title="Settings"
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Main content area */}
        {viewMode === 'summary' ? (
          <SummaryView currentDate={currentDate} />
        ) : (
          <TimelineView
            loading={loading}
            screenshots={screenshots}
            screenshotsWithCommits={screenshotsWithCommits}
            gitCommits={gitCommits}
            dayBounds={dayBounds}
            currentTimestamp={currentTimestamp}
            hoverTimestamp={hoverTimestamp}
            setHoverTimestamp={setHoverTimestamp}
            onSeek={setCurrentTimestamp}
          />
        )}
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

      {migration.status === 'running' || migration.status === 'error' ? (
        <MigrationOverlay progress={migration.progress} isError={migration.status === 'error'} />
      ) : null}
    </TooltipProvider>
  )
}

export default App
