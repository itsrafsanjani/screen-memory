import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Copy, Download, FolderOpen, Minus, Plus } from 'lucide-react'
import type { ScreenshotRecord } from '../../../types'
import { screenshotSrc } from '../lib/screenshot-src'
import { formatTime } from '../lib/time-utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

const MIN_ZOOM = 1
const MAX_ZOOM = 8
const ZOOM_STEP = 0.25

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** All screenshots of the day, in timestamp order; arrows step within one display. */
  screenshots: ScreenshotRecord[]
  displayId: string
  timestamp: number
  label: string
}

export function ScreenshotLightbox({
  open,
  onOpenChange,
  screenshots,
  displayId,
  timestamp,
  label
}: Props): React.JSX.Element {
  const frames = useMemo(
    () => screenshots.filter((s) => s.display_id === displayId),
    [screenshots, displayId]
  )

  // The component mounts on open, so the initializer is what lands the user on
  // the frame they were looking at rather than wherever a previous visit left off.
  const [index, setIndex] = useState(() => {
    const found = frames.findIndex((s) => s.timestamp === timestamp)
    return found >= 0 ? found : 0
  })
  const [zoom, setZoom] = useState(MIN_ZOOM)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [status, setStatus] = useState<string | null>(null)
  // The origin lives in a ref (it changes on every pointer move), but whether a
  // drag is in progress is state because the cursor and transition read it.
  const [dragging, setDragging] = useState(false)
  const dragOrigin = useRef<{ x: number; y: number } | null>(null)

  const current = frames[index]

  const resetView = useCallback(() => {
    setZoom(MIN_ZOOM)
    setOffset({ x: 0, y: 0 })
  }, [])

  useEffect(() => {
    if (!status) return
    const t = setTimeout(() => setStatus(null), 2000)
    return () => clearTimeout(t)
  }, [status])

  // Zoom and pan belong to the frame they were applied to, so stepping resets them.
  const step = useCallback(
    (delta: number) => {
      setIndex((i) => Math.min(frames.length - 1, Math.max(0, i + delta)))
      resetView()
    },
    [frames.length, resetView]
  )

  const changeZoom = useCallback((delta: number) => {
    setZoom((z) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z + delta))
      if (next === MIN_ZOOM) setOffset({ x: 0, y: 0 })
      return next
    })
  }, [])

  const run = useCallback(async (action: () => Promise<unknown>, message: string) => {
    try {
      const result = await action()
      // A cancelled save dialog resolves to null; saying "Saved" would be a lie.
      if (result !== null) setStatus(message)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Something went wrong')
    }
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      step(-1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      step(1)
    }
  }

  const handleWheel = (e: React.WheelEvent): void => {
    if (!e.ctrlKey && !e.metaKey) return
    changeZoom(e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP)
  }

  const handlePointerDown = (e: React.PointerEvent): void => {
    if (zoom === MIN_ZOOM) return
    dragOrigin.current = { x: e.clientX - offset.x, y: e.clientY - offset.y }
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent): void => {
    if (!dragOrigin.current) return
    setOffset({ x: e.clientX - dragOrigin.current.x, y: e.clientY - dragOrigin.current.y })
  }

  const handlePointerUp = (e: React.PointerEvent): void => {
    dragOrigin.current = null
    setDragging(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="h-[92vh] w-[92vw] max-w-none gap-0 overflow-hidden p-0 sm:max-w-none"
        onKeyDown={handleKeyDown}
      >
        <DialogTitle className="sr-only">
          {label} at {current ? formatTime(current.timestamp) : ''}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Full size screenshot. Use the left and right arrow keys to step between frames.
        </DialogDescription>

        <div className="flex h-full flex-col">
          <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-4 py-2.5 pr-12">
            <span className="text-sm font-medium">{label}</span>
            <span className="text-sm text-muted-foreground">
              {current ? formatTime(current.timestamp) : ''}
            </span>

            <div className="ml-2 flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={index <= 0}
                onClick={() => step(-1)}
                title="Previous frame"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="text-xs tabular-nums text-muted-foreground">
                {frames.length > 0 ? `${index + 1} / ${frames.length}` : '0 / 0'}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={index >= frames.length - 1}
                onClick={() => step(1)}
                title="Next frame"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>

            <div className="ml-auto flex items-center gap-1">
              {status ? <span className="mr-2 text-xs text-muted-foreground">{status}</span> : null}

              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={zoom <= MIN_ZOOM}
                onClick={() => changeZoom(-ZOOM_STEP)}
                title="Zoom out"
              >
                <Minus className="size-4" />
              </Button>
              <button
                type="button"
                onClick={resetView}
                title="Reset zoom"
                className="w-12 text-xs tabular-nums text-muted-foreground hover:text-foreground"
              >
                {Math.round(zoom * 100)}%
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={zoom >= MAX_ZOOM}
                onClick={() => changeZoom(ZOOM_STEP)}
                title="Zoom in"
              >
                <Plus className="size-4" />
              </Button>

              <span className="mx-1 h-5 w-px bg-border" />

              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={!current}
                onClick={() =>
                  current &&
                  void run(
                    () => window.electronAPI.copyScreenshotToClipboard(current.file_path),
                    'Copied'
                  )
                }
                title="Copy image"
              >
                <Copy className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={!current}
                onClick={() =>
                  current &&
                  void run(() => window.electronAPI.saveScreenshotAs(current.file_path), 'Saved')
                }
                title="Save as…"
              >
                <Download className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={!current}
                onClick={() =>
                  current &&
                  void run(
                    () => window.electronAPI.revealScreenshotInFinder(current.file_path),
                    'Revealed in Finder'
                  )
                }
                title="Reveal in Finder"
              >
                <FolderOpen className="size-4" />
              </Button>
            </div>
          </div>

          <div
            className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-muted/30"
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onDoubleClick={resetView}
            style={{
              cursor: zoom > MIN_ZOOM ? (dragging ? 'grabbing' : 'grab') : 'auto'
            }}
          >
            {current ? (
              <img
                src={screenshotSrc(current.file_path)}
                alt={`${label} at ${formatTime(current.timestamp)}`}
                draggable={false}
                className="max-h-full max-w-full object-contain select-none"
                style={{
                  transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                  transition: dragging ? 'none' : 'transform 100ms ease-out'
                }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                This screenshot is no longer available
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
