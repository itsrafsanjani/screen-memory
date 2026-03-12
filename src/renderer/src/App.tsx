import { useEffect, useState } from 'react'
import { useTimeline } from './hooks/useTimeline'
import { usePlayback } from './hooks/usePlayback'
import { ScreenshotViewer } from './components/ScreenshotViewer'
import { Timeline } from './components/Timeline'
import { DayPicker } from './components/DayPicker'
import { PlaybackControls } from './components/PlaybackControls'
import { Button } from '@/components/ui/button'
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

  const { isPlaying, speed, toggle, skipForward, skipBackward, setSpeed } = usePlayback(
    screenshots,
    currentTimestamp,
    setCurrentTimestamp
  )

  const [hoverTimestamp, setHoverTimestamp] = useState<number | null>(null)
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
      <div className="h-screen flex flex-col bg-background">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleRecording}
              className="gap-1.5 text-xs"
            >
              <span
                className={`w-2 h-2 rounded-full ${isRecording ? 'bg-recording animate-pulse' : 'bg-muted-foreground/40'}`}
              />
              <span className="text-muted-foreground">
                {isRecording ? 'Recording' : 'Paused'}
              </span>
            </Button>
          </div>

          <DayPicker
            currentDate={currentDate}
            hasPrevious={hasPreviousDate}
            hasNext={hasNextDate}
            onPrevious={goToPreviousDate}
            onNext={goToNextDate}
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
        </div>

        {/* Screenshot viewer */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            Loading...
          </div>
        ) : (
          <ScreenshotViewer screenshots={screenshots} currentTimestamp={currentTimestamp} hoverTimestamp={hoverTimestamp} />
        )}

        {/* Timeline */}
        <div className="border-t border-border">
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
