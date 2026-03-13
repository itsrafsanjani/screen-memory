import { useEffect, useState } from 'react'
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

  const {
    isPlaying,
    speed,
    toggle,
    skipForward,
    skipBackward,
    setSpeed,
    cycleSpeedUp,
    cycleSpeedDown
  } = usePlayback(screenshots, currentTimestamp, setCurrentTimestamp)

  const [hoverTimestamp, setHoverTimestamp] = useState<number | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('timeline')
  const [settingsOpen, setSettingsOpen] = useState(false)

  const gitCommits = useGitCommits(currentDate)
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
      <div className="h-screen flex flex-col">
        {/* Toolbar */}
        <div className="drag-region grid grid-cols-[1fr_auto_1fr] items-center pl-[80px] pr-4 py-1.5 border-b border-border">
          <div className="justify-self-start flex items-center gap-2">
            <Badge
              variant="secondary"
              className={`no-drag cursor-pointer ${isRecording ? 'text-green-600' : ''}`}
              onClick={toggleRecording}
              asChild
            >
              <button>
                <span
                  className={`w-1.5 h-1.5 rounded-full ${isRecording ? 'bg-recording animate-pulse ' : 'bg-muted-foreground/40'}`}
                />
                {isRecording ? 'Recording' : 'Paused'}
              </button>
            </Badge>

            {/* View mode toggle */}
            <div className="no-drag flex items-center gap-0.5">
              <Button
                variant={viewMode === 'timeline' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-6 w-6"
                onClick={() => setViewMode('timeline')}
                title="Timeline"
              >
                <Monitor className="h-3 w-3" />
              </Button>
              <Button
                variant={viewMode === 'summary' ? 'secondary' : 'ghost'}
                size="icon"
                className="h-6 w-6"
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
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
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
            <div className="border-t border-border w-full">
              <Timeline
                screenshots={screenshots}
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
