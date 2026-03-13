import { useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useSettings } from '../hooks/useSettings'
import { GeneralSettings } from './settings/GeneralSettings'
import { CaptureSettings } from './settings/CaptureSettings'
import { StorageSettings } from './settings/StorageSettings'
import { GitSettings } from './settings/GitSettings'
import { AIProviderSettings } from './settings/AIProviderSettings'
import { Settings as SettingsIcon, Camera, HardDrive, GitBranch, Sparkles } from 'lucide-react'

const SECTIONS = [
  { id: 'general', label: 'General', icon: SettingsIcon },
  { id: 'capture', label: 'Capture', icon: Camera },
  { id: 'storage', label: 'Storage', icon: HardDrive },
  { id: 'git', label: 'Git', icon: GitBranch },
  { id: 'ai', label: 'AI Provider', icon: Sparkles }
] as const

type SectionId = (typeof SECTIONS)[number]['id']

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: Props): React.JSX.Element {
  const [activeSection, setActiveSection] = useState<SectionId>('general')
  const { getSetting, updateSetting, loading } = useSettings()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[600px] p-0 gap-0">
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <div className="flex min-h-[400px]">
          {/* Left sidebar navigation */}
          <nav className="w-[160px] border-r border-border p-2 space-y-0.5">
            {SECTIONS.map((section) => {
              const Icon = section.icon
              return (
                <button
                  key={section.id}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-sm transition-colors ${
                    activeSection === section.id
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                  }`}
                  onClick={() => setActiveSection(section.id)}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {section.label}
                </button>
              )
            })}
          </nav>

          {/* Right content area */}
          <div className="flex-1 p-4 overflow-y-auto">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading settings...</p>
            ) : (
              <>
                {activeSection === 'general' && <GeneralSettings />}
                {activeSection === 'capture' && (
                  <CaptureSettings getSetting={getSetting} updateSetting={updateSetting} />
                )}
                {activeSection === 'storage' && (
                  <StorageSettings getSetting={getSetting} updateSetting={updateSetting} />
                )}
                {activeSection === 'git' && (
                  <GitSettings getSetting={getSetting} updateSetting={updateSetting} />
                )}
                {activeSection === 'ai' && (
                  <AIProviderSettings getSetting={getSetting} updateSetting={updateSetting} />
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
