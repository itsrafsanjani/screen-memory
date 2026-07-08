import { useState } from 'react'
import { Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { formatTimeShort } from '../lib/time-utils'
import type { RangeSelection } from '../hooks/useRangeSelection'

interface Props {
  selection: RangeSelection
  screenshotCount: number
  onCancel: () => void
  onConfirm: (start: number, end: number) => Promise<void>
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function RangeDeleteBar({
  selection,
  screenshotCount,
  onCancel,
  onConfirm
}: Props): React.JSX.Element {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const { startMs, endMs } = selection
  const duration = formatDuration(endMs - startMs)

  const handleConfirm = async (): Promise<void> => {
    setDeleting(true)
    try {
      await onConfirm(startMs, endMs)
      setConfirmOpen(false)
    } catch (err) {
      console.error('Failed to delete range:', err)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2 bg-destructive/10 border-b border-destructive/30">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">
          {formatTimeShort(startMs)} – {formatTimeShort(endMs)}
        </span>
        <span className="text-muted-foreground">
          · {duration} · {screenshotCount} {screenshotCount === 1 ? 'screenshot' : 'screenshots'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="h-7" onClick={onCancel}>
          <X className="h-3.5 w-3.5" />
          Cancel
        </Button>
        <Button
          variant="destructive"
          size="sm"
          className="h-7"
          disabled={screenshotCount === 0}
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={(open) => !deleting && setConfirmOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this time range?</DialogTitle>
            <DialogDescription>
              This permanently deletes {screenshotCount}{' '}
              {screenshotCount === 1 ? 'screenshot' : 'screenshots'} captured between{' '}
              {formatTimeShort(startMs)} and {formatTimeShort(endMs)} across all displays, including
              their image files and searchable text. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleConfirm()} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
