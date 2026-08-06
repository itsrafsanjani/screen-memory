import { BrowserWindow } from 'electron'
import { getSetting } from './db/repositories/settings'
import { getCommitsByDateRange } from './db/repositories/git'
import { getOcrByTimeRange } from './db/repositories/ocr'
import { getUsageTotals } from './db/repositories/app-usage'
import { IPC } from '../shared/ipc-channels'
import { DEFAULT_SUMMARY_PROMPT } from '../shared/prompts'

export class AiService {
  async streamSummary(
    startMs: number,
    endMs: number,
    webContents: BrowserWindow['webContents']
  ): Promise<void> {
    const provider = getSetting('ai.provider') || 'openai'
    const apiKey = getSetting('ai.apiKey')
    const model = getSetting('ai.model') || this.getDefaultModel(provider)
    const baseUrl = getSetting('ai.baseUrl')

    if (!apiKey && provider !== 'ollama' && provider !== 'lmstudio') {
      webContents.send(IPC.ai.summaryError, 'No API key configured. Please set one in Settings.')
      webContents.send(IPC.ai.summaryDone)
      return
    }

    try {
      const prompt = this.buildPrompt(startMs, endMs)

      // Dynamic import to avoid bundling issues
      const { streamText } = await import('ai')
      const modelInstance = await this.createModel(provider, apiKey, model, baseUrl)

      const result = streamText({
        model: modelInstance,
        prompt
      })

      for await (const chunk of result.textStream) {
        webContents.send(IPC.ai.summaryChunk, chunk)
      }
    } catch (err) {
      console.error('AI summary error:', err)
      webContents.send(IPC.ai.summaryError, this.getErrorMessage(err, provider))
    } finally {
      webContents.send(IPC.ai.summaryDone)
    }
  }

  private getDefaultModel(provider: string): string {
    switch (provider) {
      case 'anthropic':
        return 'claude-sonnet-4-20250514'
      case 'google':
        return 'gemini-2.0-flash'
      case 'ollama':
        return 'llama3'
      case 'lmstudio':
        return ''
      default:
        return 'gpt-4o-mini'
    }
  }

  private async createModel(
    provider: string,
    apiKey: string | null,
    model: string,
    baseUrl: string | null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Promise<any> {
    switch (provider) {
      case 'anthropic': {
        const { createAnthropic } = await import('@ai-sdk/anthropic')
        const anthropic = createAnthropic({ apiKey: apiKey! })
        return anthropic(model)
      }
      case 'google': {
        const { createGoogleGenerativeAI } = await import('@ai-sdk/google')
        const google = createGoogleGenerativeAI({ apiKey: apiKey! })
        return google(model)
      }
      case 'ollama': {
        const { createOpenAI } = await import('@ai-sdk/openai')
        const ollama = createOpenAI({
          baseURL: baseUrl || 'http://localhost:11434/v1',
          apiKey: 'ollama'
        })
        return ollama(model)
      }
      case 'lmstudio': {
        const { createOpenAI } = await import('@ai-sdk/openai')
        const lmstudio = createOpenAI({
          baseURL: baseUrl || 'http://localhost:1234/v1',
          apiKey: 'lmstudio'
        })
        return lmstudio(model)
      }
      default: {
        const { createOpenAI } = await import('@ai-sdk/openai')
        const openai = createOpenAI({
          apiKey: apiKey!,
          ...(baseUrl ? { baseURL: baseUrl } : {})
        })
        return openai(model)
      }
    }
  }

  private getErrorMessage(err: unknown, provider: string): string {
    const errMsg = err instanceof Error ? err.message : String(err)

    // Walk the error tree to extract code/status from nested errors (AI SDK wraps errors).
    // RetryError uses `lastError` and `errors[]`, not just `cause`, so we visit those too.
    let errCode: string | undefined
    let statusCode: number | undefined
    const visited = new Set<unknown>()
    const queue: unknown[] = [err]
    while (queue.length > 0) {
      const current = queue.shift()
      if (!current || typeof current !== 'object' || visited.has(current)) continue
      visited.add(current)

      if (!errCode) errCode = (current as { code?: string }).code
      if (!statusCode) {
        statusCode =
          (current as { status?: number }).status || (current as { statusCode?: number }).statusCode
      }

      // Follow all paths the AI SDK uses to nest errors
      const cause = (current as { cause?: unknown }).cause
      const lastError = (current as { lastError?: unknown }).lastError
      const errors = (current as { errors?: unknown[] }).errors
      if (cause) queue.push(cause)
      if (lastError) queue.push(lastError)
      if (Array.isArray(errors)) queue.push(...errors)
    }

    // Fallback: check the message string for common patterns
    if (!errCode && errMsg.includes('ECONNREFUSED')) errCode = 'ECONNREFUSED'
    if (!errCode && errMsg.includes('ETIMEDOUT')) errCode = 'ETIMEDOUT'

    if (errCode === 'ECONNREFUSED') {
      return `Cannot connect to ${provider}. Make sure it's running.`
    }
    if (errCode === 'ETIMEDOUT' || errCode === 'ESOCKETTIMEDOUT') {
      return `Connection to ${provider} timed out. Check your network or try again.`
    }
    if (statusCode === 401 || statusCode === 403) {
      return 'Invalid API key. Check your key in Settings.'
    }
    if (statusCode === 404) {
      return 'Model not found. Check the model name in Settings.'
    }
    if (statusCode === 429) {
      return 'Rate limited. Please wait and try again.'
    }
    if (statusCode && statusCode >= 500) {
      return `Server error from ${provider}. Try again later.`
    }

    return errMsg || 'Failed to generate summary'
  }

  private getHourBlock(timestampMs: number): string {
    const hour = new Date(timestampMs).getHours()
    const start = String(hour).padStart(2, '0') + ':00'
    const end = String(hour + 1).padStart(2, '0') + ':00'
    return `${start} - ${end}`
  }

  private formatUsageDuration(ms: number): string {
    const totalMinutes = Math.round(ms / 60000)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
    return `${minutes}m`
  }

  private buildPrompt(startMs: number, endMs: number): string {
    // Get git commits for the period
    const commits = getCommitsByDateRange(startMs, endMs)

    // Where the time actually went — only apps with at least a minute, so the
    // list isn't padded out with incidental app switches.
    const usage = getUsageTotals(startMs, endMs)
      .filter((u) => u.duration_ms >= 60_000)
      .slice(0, 15)

    // Get sampled OCR text — one sample every 5 minutes
    const ocrSamples: { timestamp: number; text: string }[] = []
    const sampleInterval = 5 * 60 * 1000
    const ocrRows = getOcrByTimeRange(startMs, endMs)

    let lastSampledTs = 0
    for (const row of ocrRows) {
      if (row.timestamp - lastSampledTs < sampleInterval) continue
      if (row.is_idle) continue
      if (!row.text.trim()) continue
      ocrSamples.push({
        timestamp: row.timestamp,
        text: row.text.slice(0, 200)
      })
      lastSampledTs = row.timestamp
    }

    const startDate = new Date(startMs).toLocaleDateString()
    const endDate = new Date(endMs).toLocaleDateString()
    const period = startDate === endDate ? startDate : `${startDate} - ${endDate}`

    // Group commits by hour block, then by repo within each hour
    const commitsByHour = new Map<string, Map<string, typeof commits>>()
    for (const c of commits) {
      const block = this.getHourBlock(c.timestamp)
      if (!commitsByHour.has(block)) commitsByHour.set(block, new Map())
      const repoMap = commitsByHour.get(block)!
      const existing = repoMap.get(c.repo_name) || []
      existing.push(c)
      repoMap.set(c.repo_name, existing)
    }

    // Group OCR samples by hour block, cap at 6 per block
    const ocrByHour = new Map<string, typeof ocrSamples>()
    for (const s of ocrSamples) {
      const block = this.getHourBlock(s.timestamp)
      const existing = ocrByHour.get(block) || []
      if (existing.length < 6) {
        existing.push(s)
        ocrByHour.set(block, existing)
      }
    }

    const customPrompt = getSetting('ai.summaryPrompt')
    const template = customPrompt && customPrompt.trim() ? customPrompt : DEFAULT_SUMMARY_PROMPT
    let prompt = `${template}\n\n## Period\n\n${period}\n\n`

    // Add git commits grouped by hour and repo
    if (commitsByHour.size > 0) {
      prompt += `## Raw Data: Git Commits (Primary)\n\n`
      for (const [block, repoMap] of commitsByHour) {
        prompt += `### ${block}\n`
        for (const [repo, repoCommits] of repoMap) {
          prompt += `**${repo}**\n`
          for (const c of repoCommits) {
            const time = new Date(c.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              hour12: false
            })
            prompt += `- [${time}] ${c.message} (+${c.insertions}/-${c.deletions}, ${c.files_changed} files)\n`
          }
        }
        prompt += '\n'
      }
    }

    // Add per-app time totals
    if (usage.length > 0) {
      prompt += `## Raw Data: App Usage\n\n`
      for (const app of usage) {
        prompt += `- ${app.app_name} — ${this.formatUsageDuration(app.duration_ms)}\n`
      }
      prompt += '\n'
    }

    // Add OCR samples grouped by hour
    if (ocrByHour.size > 0) {
      prompt += `## Raw Data: Screen Activity Samples (Supplementary)\n\n`
      for (const [block, samples] of ocrByHour) {
        prompt += `### ${block}\n`
        for (const s of samples) {
          const time = new Date(s.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          })
          prompt += `[${time}]: ${s.text}\n\n`
        }
      }
    }

    if (commits.length === 0 && ocrSamples.length === 0 && usage.length === 0) {
      prompt += `No activity data found for this period.\n`
    }

    return prompt
  }
}
