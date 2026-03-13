import { useState, useEffect } from 'react'
import type { GitCommit } from '../../../types'

export function useGitCommits(currentDate: string): GitCommit[] {
  const [commits, setCommits] = useState<GitCommit[]>([])

  useEffect(() => {
    const [year, month, day] = currentDate.split('-').map(Number)
    const start = new Date(year, month - 1, day, 0, 0, 0, 0).getTime()
    const end = new Date(year, month - 1, day, 23, 59, 59, 999).getTime()

    window.electronAPI.getGitCommitsByDate(start, end).then(setCommits).catch(console.error)
  }, [currentDate])

  return commits
}
