import { BrowserWindow } from 'electron'
import { DatabaseService } from './database-service'

export class AiService {
  private db: DatabaseService

  constructor(db: DatabaseService) {
    this.db = db
  }

  async streamSummary(
    startMs: number,
    endMs: number,
    webContents: BrowserWindow['webContents']
  ): Promise<void> {
    const provider = this.db.getSetting('ai.provider') || 'openai'
    const apiKey = this.db.getSetting('ai.apiKey')
    const model = this.db.getSetting('ai.model') || this.getDefaultModel(provider)
    const baseUrl = this.db.getSetting('ai.baseUrl')

    if (!apiKey && provider !== 'ollama') {
      webContents.send('summary-error', 'No API key configured. Please set one in Settings.')
      return
    }

    const prompt = this.buildPrompt(startMs, endMs)

    try {
      // Dynamic import to avoid bundling issues
      const { streamText } = await import('ai')
      const modelInstance = await this.createModel(provider, apiKey, model, baseUrl)

      const result = streamText({
        model: modelInstance,
        prompt
      })

      for await (const chunk of result.textStream) {
        webContents.send('summary-chunk', chunk)
      }

      webContents.send('summary-done')
    } catch (err) {
      console.error('AI summary error:', err)
      webContents.send(
        'summary-error',
        err instanceof Error ? err.message : 'Failed to generate summary'
      )
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

  private buildPrompt(startMs: number, endMs: number): string {
    // Get git commits for the period
    const commits = this.db.getCommitsByDateRange(startMs, endMs)

    // Get sampled OCR text — one sample every 5 minutes
    const ocrSamples: { timestamp: number; text: string }[] = []
    const sampleInterval = 5 * 60 * 1000
    const screenshots = this.db.getScreenshotsByTimeRange(startMs, endMs)

    let lastSampledTs = 0
    for (const shot of screenshots) {
      if (shot.timestamp - lastSampledTs < sampleInterval) continue
      if (shot.is_idle) continue

      const ocr = this.db.getOcrByScreenshotId(shot.id)
      if (ocr && ocr.text.trim()) {
        ocrSamples.push({
          timestamp: shot.timestamp,
          text: ocr.text.slice(0, 200)
        })
        lastSampledTs = shot.timestamp
      }
    }

    const startDate = new Date(startMs).toLocaleDateString()
    const endDate = new Date(endMs).toLocaleDateString()
    const period = startDate === endDate ? startDate : `${startDate} - ${endDate}`

    let prompt = `You are summarizing a developer's work activity for the period: ${period}.

Based on the following data, write a concise summary of what the developer worked on, organized by project/repo. Include key accomplishments, areas of focus, and a brief timeline of activity.

Format the output as clean Markdown with headers and bullet points.

`

    // Add git commits grouped by repo
    if (commits.length > 0) {
      prompt += `## Git Commits\n\n`
      const byRepo = new Map<string, typeof commits>()
      for (const c of commits) {
        const existing = byRepo.get(c.repo_name) || []
        existing.push(c)
        byRepo.set(c.repo_name, existing)
      }
      for (const [repo, repoCommits] of byRepo) {
        prompt += `### ${repo}\n`
        for (const c of repoCommits) {
          const time = new Date(c.timestamp).toLocaleTimeString()
          prompt += `- [${time}] ${c.message} (+${c.insertions}/-${c.deletions}, ${c.files_changed} files)\n`
        }
        prompt += '\n'
      }
    }

    // Add OCR samples
    if (ocrSamples.length > 0) {
      prompt += `## Screen Activity Samples\n\n`
      // Limit total prompt size
      const maxSamples = 30
      const step = Math.max(1, Math.floor(ocrSamples.length / maxSamples))
      for (let i = 0; i < ocrSamples.length; i += step) {
        const s = ocrSamples[i]
        const time = new Date(s.timestamp).toLocaleTimeString()
        prompt += `[${time}]: ${s.text}\n\n`
      }
    }

    if (commits.length === 0 && ocrSamples.length === 0) {
      prompt += `No activity data found for this period.\n`
    }

    return prompt
  }
}
