import { useEffect, useState } from 'react'
import { useTimeline } from './hooks/useTimeline'
import { usePlayback } from './hooks/usePlayback'
import { ScreenshotViewer } from './components/ScreenshotViewer'
import { Timeline } from './components/Timeline'
import { DayPicker } from './components/DayPicker'
import { PlaybackControls } from './components/PlaybackControls'
import { Badge } from '@/components/ui/badge'
import { TooltipProvider } from '@/components/ui/tooltip'

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

  const toggleRecording = async (): Promise<void> => {
    if (isRecording) {
      await window.electronAPI.stopCapture()
    } else {
      await window.electronAPI.startCapture()
    }
  }

  return (
    <TooltipProvider>
      <div className="h-screen flex flex-col">
        {/* Toolbar */}
        <div className="drag-region grid grid-cols-[1fr_auto_1fr] items-center pl-[80px] pr-4 py-1.5 border-b border-border">
          <div className="justify-self-start">
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

          <div className="no-drag justify-self-end">
            <PlaybackControls
              isPlaying={isPlaying}
              speed={speed}
              currentTimestamp={currentTimestamp}
              onToggle={toggle}
              onSkipForward={skipForward}
              onSkipBackward={skipBackward}
              onSpeedChange={setSpeed}
            />
          </div>
        </div>

        {/* Screenshot viewer */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Loading...
          </div>
        ) : (
          <ScreenshotViewer
            screenshots={screenshots}
            currentTimestamp={currentTimestamp}
            hoverTimestamp={hoverTimestamp}
          />
        )}

        {/* Timeline */}
        <div className="border-t border-border w-full">
          <Timeline
            screenshots={screenshots}
            dayBounds={dayBounds}
            currentTimestamp={currentTimestamp}
            onSeek={setCurrentTimestamp}
            onHoverTimestamp={setHoverTimestamp}
          />
        </div>
      </div>
    </TooltipProvider>
  )
}

export default App
