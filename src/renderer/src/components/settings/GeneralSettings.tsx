import { Label } from '@/components/ui/label'
import { useEffect, useState } from 'react'

export function GeneralSettings(): React.JSX.Element {
  const [version, setVersion] = useState('0.0.1')

  useEffect(() => {
    window.electronAPI.getAppVersion().then(setVersion)
  }, [])

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">General</h3>

      <div className="space-y-2">
        <Label>About</Label>
        <p className="text-sm text-muted-foreground">
          Screen Memory captures and organizes your screen activity, integrates with git, and
          provides AI-powered summaries of your work.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Version</Label>
        <p className="text-sm font-mono text-muted-foreground">{version}</p>
      </div>
    </div>
  )
}
