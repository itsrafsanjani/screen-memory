import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Plus, Trash2, RefreshCw } from 'lucide-react'
import type { GitRepo } from '../../../../types'

interface Props {
  getSetting: (key: string, defaultValue?: string) => string
  updateSetting: (key: string, value: string) => Promise<void>
}

export function GitSettings({ getSetting, updateSetting }: Props): React.JSX.Element {
  const [repos, setRepos] = useState<GitRepo[]>([])
  const [scanning, setScanning] = useState(false)

  const watchDirs: string[] = (() => {
    try {
      return JSON.parse(getSetting('git.watchDirs', '[]'))
    } catch {
      return []
    }
  })()

  useEffect(() => {
    window.electronAPI.getGitRepos().then(setRepos).catch(console.error)
  }, [])

  const addDirectory = async (): Promise<void> => {
    const dir = await window.electronAPI.openDirectoryDialog()
    if (dir && !watchDirs.includes(dir)) {
      const updated = [...watchDirs, dir]
      await updateSetting('git.watchDirs', JSON.stringify(updated))
    }
  }

  const removeDirectory = async (dir: string): Promise<void> => {
    const updated = watchDirs.filter((d) => d !== dir)
    await updateSetting('git.watchDirs', JSON.stringify(updated))
  }

  const handleScan = async (): Promise<void> => {
    setScanning(true)
    try {
      await window.electronAPI.scanGitRepos()
      const updated = await window.electronAPI.getGitRepos()
      setRepos(updated)
    } catch (err) {
      console.error('Scan failed:', err)
    }
    setScanning(false)
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">Git Integration</h3>

      <div className="space-y-2">
        <Label>Watch Directories</Label>
        <p className="text-xs text-muted-foreground">
          Directories to scan for git repositories. Defaults to ~/Projects, ~/Code, etc.
        </p>
        <div className="space-y-1">
          {watchDirs.map((dir) => (
            <div key={dir} className="flex items-center gap-2 text-sm">
              <span className="flex-1 truncate font-mono text-xs">{dir}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => removeDirectory(dir)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={addDirectory}>
          <Plus className="h-3 w-3 mr-1" />
          Add Directory
        </Button>
      </div>

      <div className="space-y-2">
        <Label>Git Author Email</Label>
        <p className="text-xs text-muted-foreground">
          Only show commits from this email. Auto-detected from git config if left empty.
        </p>
        <Input
          type="text"
          placeholder="Auto-detect from git config"
          value={getSetting('git.authorEmail', '')}
          onChange={(e) => updateSetting('git.authorEmail', e.target.value)}
          className="w-64"
        />
      </div>

      <div className="space-y-2">
        <Label>Scan Interval (minutes)</Label>
        <Input
          type="number"
          value={getSetting('git.scanIntervalMinutes', '60')}
          onChange={(e) => updateSetting('git.scanIntervalMinutes', e.target.value)}
          className="w-24"
        />
      </div>

      <div className="space-y-2">
        <Label>Poll Interval (minutes)</Label>
        <Input
          type="number"
          value={getSetting('git.pollIntervalMinutes', '5')}
          onChange={(e) => updateSetting('git.pollIntervalMinutes', e.target.value)}
          className="w-24"
        />
      </div>

      <div className="pt-2">
        <Button variant="outline" size="sm" onClick={handleScan} disabled={scanning}>
          <RefreshCw className={`h-3 w-3 mr-1 ${scanning ? 'animate-spin' : ''}`} />
          {scanning ? 'Scanning...' : 'Scan Now'}
        </Button>
        <p className="text-xs text-muted-foreground mt-1">{repos.length} repositories discovered</p>
      </div>
    </div>
  )
}
