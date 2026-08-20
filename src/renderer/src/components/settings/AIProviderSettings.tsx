import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { DEFAULT_SUMMARY_PROMPT } from '@shared/prompts'

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

  const storedPrompt = getSetting('ai.summaryPrompt')
  const summaryPrompt = storedPrompt.trim() ? storedPrompt : DEFAULT_SUMMARY_PROMPT
  const isDefaultPrompt = !storedPrompt.trim()

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
            autoComplete="off"
            placeholder={
              getSetting('ai.hasApiKey') === '1'
                ? 'Key saved — enter a new one to replace'
                : 'Enter API key...'
            }
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
          <p className="text-xs text-muted-foreground">
            Official OpenAI API, localhost, or a private LAN address for Ollama / LM Studio. Public
            third-party hosts are rejected so the API key cannot be redirected off-box.
          </p>
        </div>
      ) : null}

      <div className="space-y-2">
        <Label>Summary Prompt</Label>
        <Textarea
          className="field-sizing-fixed h-40 resize-y font-mono text-xs"
          value={summaryPrompt}
          onChange={(e) => updateSetting('ai.summaryPrompt', e.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          Instructions sent to the AI. Your git commits, screen activity, and the date range are
          appended automatically.
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isDefaultPrompt}
            onClick={() => updateSetting('ai.summaryPrompt', '')}
          >
            Reset to default
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="sm">
                View default
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Default Summary Prompt</DialogTitle>
                <DialogDescription>
                  The built-in prompt shipped with the current version. Updates when the app is
                  upgraded.
                </DialogDescription>
              </DialogHeader>
              <Textarea
                readOnly
                value={DEFAULT_SUMMARY_PROMPT}
                className="field-sizing-fixed h-72 resize-none font-mono text-xs"
              />
              <DialogFooter showCloseButton />
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  )
}
