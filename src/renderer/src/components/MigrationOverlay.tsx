import { Loader2 } from 'lucide-react'
import type { MigrationProgress } from '../../../types'

const PHASE_LABELS: Record<MigrationProgress['phase'], string> = {
  idle: 'Preparing…',
  preparing: 'Preparing one-time data migration…',
  backup: 'Backing up your current database…',
  'migrate-schema': 'Applying the latest schema…',
  'copy-table': 'Copying your data',
  verify: 'Verifying migrated data…',
  swap: 'Finalizing…',
  done: 'All set.',
  error: 'Something went wrong.'
}

function formatProgressLine(progress: MigrationProgress): string | null {
  if (progress.phase === 'copy-table' && progress.table) {
    if (progress.rowsTotal && progress.rowsTotal > 0) {
      return `${progress.table}: ${progress.rowsDone ?? 0} / ${progress.rowsTotal} rows`
    }
    return progress.table
  }
  return progress.message ?? null
}

interface MigrationOverlayProps {
  progress: MigrationProgress | null
  isError: boolean
}

export function MigrationOverlay({ progress, isError }: MigrationOverlayProps): React.JSX.Element {
  const phase = progress?.phase ?? 'preparing'
  const headline = PHASE_LABELS[phase]
  const detail = progress ? formatProgressLine(progress) : null

  const percent =
    progress?.phase === 'copy-table' && progress.rowsTotal && progress.rowsTotal > 0
      ? Math.min(100, Math.round(((progress.rowsDone ?? 0) / progress.rowsTotal) * 100))
      : null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 max-w-md px-8 text-center">
        {isError ? (
          <div className="text-2xl">⚠️</div>
        ) : (
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        )}
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">
            {isError ? 'Migration failed' : 'Migrating your screen memory'}
          </h2>
          <p className="text-sm text-muted-foreground">{headline}</p>
          {detail ? <p className="text-xs text-muted-foreground/80">{detail}</p> : null}
        </div>
        {percent !== null ? (
          <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-200"
              style={{ width: `${percent}%` }}
            />
          </div>
        ) : null}
        {!isError ? (
          <p className="text-xs text-muted-foreground/70">This only happens once.</p>
        ) : null}
      </div>
    </div>
  )
}
