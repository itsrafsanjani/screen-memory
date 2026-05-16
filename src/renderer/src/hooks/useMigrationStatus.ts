import { useEffect, useState } from 'react'
import type { MigrationProgress } from '../../../types'

export interface MigrationState {
  status: 'idle' | 'running' | 'done' | 'error'
  progress: MigrationProgress | null
}

export function useMigrationStatus(): MigrationState {
  const [state, setState] = useState<MigrationState>({ status: 'idle', progress: null })

  useEffect(() => {
    return window.electronAPI.onMigrationProgress((progress) => {
      if (progress.phase === 'done') {
        setState({ status: 'done', progress })
      } else if (progress.phase === 'error') {
        setState({ status: 'error', progress })
      } else {
        setState({ status: 'running', progress })
      }
    })
  }, [])

  return state
}
