import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface Props {
  getSetting: (key: string, defaultValue?: string) => string
  updateSetting: (key: string, value: string) => Promise<void>
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

export function StorageSettings({ getSetting, updateSetting }: Props): React.JSX.Element {
  const [storageUsage, setStorageUsage] = useState<number | null>(null)

  useEffect(() => {
    window.electronAPI.getStorageUsage().then(setStorageUsage).catch(console.error)
  }, [])

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">Storage</h3>

      <div className="space-y-2">
        <Label>Retention Period (days)</Label>
        <Input
          type="number"
          min="1"
          value={getSetting('storage.retentionDays', '7')}
          onChange={(e) => updateSetting('storage.retentionDays', e.target.value)}
          className="w-24"
        />
        <p className="text-xs text-muted-foreground">
          Screenshots older than this are automatically deleted (default: 7 days)
        </p>
      </div>

      <div className="space-y-2">
        <Label>OCR Text Retention (days)</Label>
        <Input
          type="number"
          min="1"
          value={getSetting('storage.ocrRetentionDays', '90')}
          onChange={(e) => updateSetting('storage.ocrRetentionDays', e.target.value)}
          className="w-24"
        />
        <p className="text-xs text-muted-foreground">
          OCR text is kept in the database after screenshots are deleted, so summaries work for
          older periods (default: 90 days).
        </p>
      </div>

      <div className="pt-2">
        <Label>Current Usage</Label>
        <p className="text-sm font-mono mt-1">
          {storageUsage !== null ? formatBytes(storageUsage) : 'Calculating...'}
        </p>
      </div>
    </div>
  )
}
