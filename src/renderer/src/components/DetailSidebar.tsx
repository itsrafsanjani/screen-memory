import { useMemo, useState, useEffect } from 'react'
import { GitBranch, ChevronRight, ChevronLeft, FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { GitCommit, ScreenshotRecord } from '../../../types'
import { formatTimeShort, findNearestScreenshot } from '../lib/time-utils'

interface Props {
  commits: GitCommit[]
  currentTimestamp: number | null
  screenshots: ScreenshotRecord[]
}

export function DetailSidebar({
  commits,
  currentTimestamp,
  screenshots
}: Props): React.JSX.Element {
  const [collapsed, setCollapsed] = useState(false)
  const [ocrText, setOcrText] = useState<string | null>(null)

  // Commits within +/- 5 minutes of current playhead
  const nearbyCommits = useMemo(() => {
    if (!currentTimestamp) return []
    const range = 5 * 60 * 1000
    return commits.filter(
      (c) => c.timestamp >= currentTimestamp - range && c.timestamp <= currentTimestamp + range
    )
  }, [commits, currentTimestamp])

  // Load OCR text for current screenshot
  const currentScreenshotId = useMemo(() => {
    if (!currentTimestamp || screenshots.length === 0) return null
    const idx = findNearestScreenshot(screenshots, currentTimestamp)
    return idx >= 0 ? screenshots[idx].id : null
  }, [currentTimestamp, screenshots])

  useEffect(() => {
    let cancelled = false

    const fetchOcr = async (): Promise<void> => {
      if (currentScreenshotId === null) {
        setOcrText(null)
        return
      }
      try {
        const text = await window.electronAPI.getOcrText(currentScreenshotId)
        if (!cancelled) setOcrText(text)
      } catch {
        if (!cancelled) setOcrText(null)
      }
    }

    fetchOcr()

    return (): void => {
      cancelled = true
    }
  }, [currentScreenshotId])

  if (collapsed) {
    return (
      <div className="border-l border-border flex flex-col items-center pt-2">
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setCollapsed(false)}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
      </div>
    )
  }

  return (
    <div className="w-[320px] border-l border-border flex flex-col min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-semibold text-muted-foreground">Details</span>
        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setCollapsed(true)}>
          <ChevronRight className="h-3 w-3" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Git commits section */}
        {nearbyCommits.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <GitBranch className="h-3.5 w-3.5 text-git-commit" />
              <span className="text-xs font-medium">Commits</span>
            </div>
            <div className="space-y-2">
              {nearbyCommits.map((c) => (
                <div
                  key={c.id}
                  className="rounded-lg border border-border border-l-2 border-l-git-commit p-2 text-xs space-y-1 shadow-xs"
                >
                  <div className="font-medium truncate">{c.message}</div>
                  <div className="text-muted-foreground">{c.repo_name}</div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span>{formatTimeShort(c.timestamp)}</span>
                    <span>
                      {c.files_changed}f <span className="text-green-500">+{c.insertions}</span>{' '}
                      <span className="text-red-500">-{c.deletions}</span>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {nearbyCommits.length === 0 && (
          <div className="text-xs text-muted-foreground">
            <GitBranch className="h-3.5 w-3.5 inline mr-1" />
            No commits near this time
          </div>
        )}

        {/* OCR text section */}
        {ocrText && (
          <div>
            <div className="flex items-center gap-1.5 mb-2">
              <FileText className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Screen Text</span>
            </div>
            <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground max-h-[200px] overflow-y-auto whitespace-pre-wrap break-words">
              {ocrText.slice(0, 500)}
              {ocrText.length > 500 && '...'}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
