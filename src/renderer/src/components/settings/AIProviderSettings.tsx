import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

interface Props {
  getSetting: (key: string, defaultValue?: string) => string
  updateSetting: (key: string, value: string) => Promise<void>
}

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google' },
  { value: 'ollama', label: 'Ollama (Local)' },
  { value: 'lmstudio', label: 'LM Studio (Local)' }
]

export function AIProviderSettings({ getSetting, updateSetting }: Props): React.JSX.Element {
  const provider = getSetting('ai.provider', 'openai')

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">AI Provider</h3>

      <div className="space-y-2">
        <Label>Provider</Label>
        <Select value={provider} onValueChange={(v) => updateSetting('ai.provider', v)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROVIDERS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {provider !== 'ollama' && provider !== 'lmstudio' && (
        <div className="space-y-2">
          <Label>API Key</Label>
          <Input
            type="password"
            placeholder="Enter API key..."
            value={getSetting('ai.apiKey')}
            onChange={(e) => updateSetting('ai.apiKey', e.target.value)}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label>Model</Label>
        <Input
          placeholder={
            provider === 'anthropic'
              ? 'claude-sonnet-4-20250514'
              : provider === 'google'
                ? 'gemini-2.0-flash'
                : provider === 'ollama'
                  ? 'llama3'
                  : provider === 'lmstudio'
                    ? 'loaded model'
                    : 'gpt-4o-mini'
          }
          value={getSetting('ai.model')}
          onChange={(e) => updateSetting('ai.model', e.target.value)}
        />
        <p className="text-xs text-muted-foreground">Leave empty for default</p>
      </div>

      {(provider === 'openai' || provider === 'ollama' || provider === 'lmstudio') && (
        <div className="space-y-2">
          <Label>Base URL</Label>
          <Input
            placeholder={
              provider === 'ollama'
                ? 'http://localhost:11434/v1'
                : provider === 'lmstudio'
                  ? 'http://localhost:1234/v1'
                  : 'Optional'
            }
            value={getSetting('ai.baseUrl')}
            onChange={(e) => updateSetting('ai.baseUrl', e.target.value)}
          />
        </div>
      )}
    </div>
  )
}
