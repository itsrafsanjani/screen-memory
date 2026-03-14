import { useEffect, useMemo, useState } from 'react'
import { useTimeline } from './hooks/useTimeline'
import { usePlayback } from './hooks/usePlayback'
import { useGitCommits } from './hooks/useGitCommits'
import { useSearch } from './hooks/useSearch'
import { ScreenshotViewer } from './components/ScreenshotViewer'
import { Timeline } from './components/Timeline'
import { DayPicker } from './components/DayPicker'
import { PlaybackControls } from './components/PlaybackControls'
import { DetailSidebar } from './components/DetailSidebar'
import { SearchBar } from './components/SearchBar'
import { SettingsDialog } from './components/Settings'
import { SummaryView } from './components/SummaryView'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Separator } from '@/components/ui/separator'
import { Settings, Sparkles, Monitor } from 'lucide-react'

function useTheme(): void {
  useEffect(() => {
    const apply = (isDark: boolean): void => {
      document.documentElement.classList.toggle('dark', isDark)
    }
    window.electronAPI.getNativeTheme().then(apply)
    const unsub = window.electronAPI.onThemeChanged(apply)
    return unsub
  }, [])
}

type ViewMode = 'timeline' | 'summary'

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

  // Merge git commits into screenshots as active-state entries for timeline segments & navigation
  const screenshotsWithCommits = useMemo(() => {
    if (gitCommits.length === 0) return screenshots
    const commitEntries = gitCommits.map((c) => ({
      id: -c.id,
      timestamp: c.timestamp,
      display_id: 'git-commit',
      file_path: '',
      width: 0,
      height: 0,
      file_size: 0,
      is_idle: false
    }))
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

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      switch (e.key) {
        case ' ':
          e.preventDefault()
          toggle()
          break
        case 'ArrowLeft':
          e.preventDefault()
          skipBackward()
          break
        case 'ArrowRight':
          e.preventDefault()
          skipForward()
          break
        case 'ArrowUp':
          e.preventDefault()
          cycleSpeedUp()
          break
        case 'ArrowDown':
          e.preventDefault()
          cycleSpeedDown()
          break
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggle, skipForward, skipBackward, cycleSpeedUp, cycleSpeedDown])

  const [isRecording, setIsRecording] = useState(false)

  useTheme()

  useEffect(() => {
    window.electronAPI.getCaptureStatus().then(setIsRecording)
    const unsub = window.electronAPI.onCaptureStatusChanged(setIsRecording)
    return unsub
  }, [])

  // Listen for settings open from tray menu
  useEffect(() => {
    const unsub = window.electronAPI.onOpenSettings(() => setSettingsOpen(true))
    return unsub
  }, [])

  const toggleRecording = async (): Promise<void> => {
    if (isRecording) {
      await window.electronAPI.stopCapture()
    } else {
      await window.electronAPI.startCapture()
    }
  }

  const handleSearchResultClick = (timestamp: number): void => {
    setCurrentTimestamp(timestamp)
    clearSearch()
  }

  return (
    <TooltipProvider>
      <div className="h-screen flex flex-col bg-background">
        {/* Toolbar */}
        <div className="drag-region grid grid-cols-[1fr_auto_1fr] items-center pl-[80px] pr-4 py-2.5 border-b border-border/60">
          <div className="justify-self-start flex items-center gap-3">
            <Badge
              variant="secondary"
              className={`no-drag cursor-pointer px-2.5 py-1 ${isRecording ? 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-400' : ''}`}
              onClick={toggleRecording}
              asChild
            >
              <button>
                <span
                  className={`w-1.5 h-1.5 rounded-full ${isRecording ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground/40'}`}
                />
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

          <div className="no-drag">
            <DayPicker
              currentDate={currentDate}
              hasPrevious={hasPreviousDate}
              hasNext={hasNextDate}
              onPrevious={goToPreviousDate}
              onNext={goToNextDate}
            />
          </div>

          <div className="no-drag justify-self-end flex items-center gap-2">
            {viewMode === 'timeline' && (
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
            )}
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
          <>
            {/* Screenshot viewer + Detail sidebar */}
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

            {/* Timeline */}
            <div className="border-t border-border/60 w-full">
              <Timeline
                screenshots={screenshotsWithCommits}
                dayBounds={dayBounds}
                currentTimestamp={currentTimestamp}
                onSeek={setCurrentTimestamp}
                onHoverTimestamp={setHoverTimestamp}
                gitCommits={gitCommits}
              />
            </div>
          </>
        )}
      </div>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </TooltipProvider>
  )
}

export default App
