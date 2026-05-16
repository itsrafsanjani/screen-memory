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
] as const

type Provider = (typeof PROVIDERS)[number]['value']

const LOCAL_PROVIDERS: ReadonlySet<Provider> = new Set(['ollama', 'lmstudio'])
const BASE_URL_PROVIDERS: ReadonlySet<Provider> = new Set(['openai', 'ollama', 'lmstudio'])

const MODEL_PLACEHOLDERS: Record<Provider, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-sonnet-4-20250514',
  google: 'gemini-2.0-flash',
  ollama: 'llama3',
  lmstudio: 'loaded model'
}

const BASE_URL_PLACEHOLDERS: Partial<Record<Provider, string>> = {
  ollama: 'http://localhost:11434/v1',
  lmstudio: 'http://localhost:1234/v1'
}

function isProvider(value: string): value is Provider {
  return PROVIDERS.some((p) => p.value === value)
}

export function AIProviderSettings({ getSetting, updateSetting }: Props): React.JSX.Element {
  const providerSetting = getSetting('ai.provider', 'openai')
  const provider: Provider = isProvider(providerSetting) ? providerSetting : 'openai'

  const showApiKey = !LOCAL_PROVIDERS.has(provider)
  const showBaseUrl = BASE_URL_PROVIDERS.has(provider)
  const baseUrlPlaceholder = BASE_URL_PLACEHOLDERS[provider] ?? 'Optional'

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

      {showApiKey ? (
        <div className="space-y-2">
          <Label>API Key</Label>
          <Input
            type="password"
            placeholder="Enter API key..."
            value={getSetting('ai.apiKey')}
            onChange={(e) => updateSetting('ai.apiKey', e.target.value)}
          />
        </div>
      ) : null}

      <div className="space-y-2">
        <Label>Model</Label>
        <Input
          placeholder={MODEL_PLACEHOLDERS[provider]}
          value={getSetting('ai.model')}
          onChange={(e) => updateSetting('ai.model', e.target.value)}
        />
        <p className="text-xs text-muted-foreground">Leave empty for default</p>
      </div>

      {showBaseUrl ? (
        <div className="space-y-2">
          <Label>Base URL</Label>
          <Input
            placeholder={baseUrlPlaceholder}
            value={getSetting('ai.baseUrl')}
            onChange={(e) => updateSetting('ai.baseUrl', e.target.value)}
          />
        </div>
      ) : null}
    </div>
  )
}
