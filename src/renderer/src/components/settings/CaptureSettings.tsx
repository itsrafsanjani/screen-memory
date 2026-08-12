import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { ExcludedApps } from './ExcludedApps'

interface Props {
  getSetting: (key: string, defaultValue?: string) => string
  updateSetting: (key: string, value: string) => Promise<void>
}

export function CaptureSettings({ getSetting, updateSetting }: Props): React.JSX.Element {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">Capture</h3>

      <div className="space-y-2">
        <Label>Active Interval (ms)</Label>
        <Input
          type="number"
          min="250"
          value={getSetting('capture.activeIntervalMs', '5000')}
          onChange={(e) => updateSetting('capture.activeIntervalMs', e.target.value)}
          className="w-32"
        />
        <p className="text-xs text-muted-foreground">
          Capture frequency when active (default: 5000ms)
        </p>
      </div>

      <div className="space-y-2">
        <Label>Idle Interval (ms)</Label>
        <Input
          type="number"
          min="250"
          value={getSetting('capture.idleIntervalMs', '30000')}
          onChange={(e) => updateSetting('capture.idleIntervalMs', e.target.value)}
          className="w-32"
        />
        <p className="text-xs text-muted-foreground">
          Capture frequency when idle (default: 30000ms)
        </p>
      </div>

      <div className="space-y-2">
        <Label>JPEG Quality</Label>
        <Input
          type="number"
          min="1"
          max="100"
          value={getSetting('capture.jpegQuality', '65')}
          onChange={(e) => updateSetting('capture.jpegQuality', e.target.value)}
          className="w-24"
        />
        <p className="text-xs text-muted-foreground">1-100, lower = smaller files (default: 65)</p>
      </div>

      <Separator />

      <ExcludedApps getSetting={getSetting} updateSetting={updateSetting} />
    </div>
  )
}
