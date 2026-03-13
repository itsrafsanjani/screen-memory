import { Label } from '@/components/ui/label'

export function GeneralSettings(): React.JSX.Element {
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
        <p className="text-sm font-mono text-muted-foreground">1.0.0</p>
      </div>
    </div>
  )
}
