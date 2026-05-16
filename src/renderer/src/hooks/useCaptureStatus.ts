import { useCallback, useEffect, useState } from 'react'

interface UseCaptureStatusResult {
  isRecording: boolean
  toggleRecording: () => Promise<void>
}

export function useCaptureStatus(): UseCaptureStatusResult {
  const [isRecording, setIsRecording] = useState(false)

  useEffect(() => {
    window.electronAPI.getCaptureStatus().then(setIsRecording)
    return window.electronAPI.onCaptureStatusChanged(setIsRecording)
  }, [])

  const toggleRecording = useCallback(async (): Promise<void> => {
    if (isRecording) {
      await window.electronAPI.stopCapture()
    } else {
      await window.electronAPI.startCapture()
    }
  }, [isRecording])

  return { isRecording, toggleRecording }
}
