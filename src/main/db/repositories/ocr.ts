import { and, asc, desc, eq, gte, like, lte, sql } from 'drizzle-orm'
import { getDb } from '../client'
import { ocrResults, screenshots } from '../schema'

export interface OcrRangeRow {
  timestamp: number
  text: string
  is_idle: number
}

export interface OcrSearchHit {
  screenshot_id: number | null
  timestamp: number
  text_snippet: string
  display_id: string
  file_path: string | null
}

const OCR_SEARCH_LIMIT = 100

export function insertOcrResult(record: {
  screenshot_id: number
  timestamp: number
  display_id: string
  is_idle: boolean
  text: string
  confidence: number
}): void {
  const db = getDb()
  db.insert(ocrResults)
    .values({
      screenshotId: record.screenshot_id,
      timestamp: record.timestamp,
      displayId: record.display_id,
      isIdle: record.is_idle ? 1 : 0,
      text: record.text,
      confidence: record.confidence
    })
    .run()
}

export function getOcrByScreenshotId(
  screenshotId: number
): { text: string; confidence: number } | null {
  const db = getDb()
  const row = db
    .select({ text: ocrResults.text, confidence: ocrResults.confidence })
    .from(ocrResults)
    .where(eq(ocrResults.screenshotId, screenshotId))
    .get()
  return row ?? null
}

export function getOcrByTimeRange(startMs: number, endMs: number): OcrRangeRow[] {
  const db = getDb()
  const rows = db
    .select({
      timestamp: ocrResults.timestamp,
      text: ocrResults.text,
      isIdle: ocrResults.isIdle
    })
    .from(ocrResults)
    .where(and(gte(ocrResults.timestamp, startMs), lte(ocrResults.timestamp, endMs)))
    .orderBy(asc(ocrResults.timestamp))
    .all()
  return rows.map((r) => ({ timestamp: r.timestamp, text: r.text, is_idle: r.isIdle }))
}

export function deleteOcrOlderThan(timestampMs: number): number {
  const db = getDb()
  const result = db
    .delete(ocrResults)
    .where(sql`${ocrResults.timestamp} < ${timestampMs}`)
    .run()
  return result.changes
}

export function searchOcr(query: string, startMs?: number, endMs?: number): OcrSearchHit[] {
  const db = getDb()
  const conditions = [like(ocrResults.text, `%${query}%`)]
  if (startMs !== undefined) conditions.push(gte(ocrResults.timestamp, startMs))
  if (endMs !== undefined) conditions.push(lte(ocrResults.timestamp, endMs))

  const rows = db
    .select({
      screenshotId: ocrResults.screenshotId,
      timestamp: ocrResults.timestamp,
      textSnippet: ocrResults.text,
      displayId: ocrResults.displayId,
      filePath: screenshots.filePath
    })
    .from(ocrResults)
    .leftJoin(screenshots, eq(ocrResults.screenshotId, screenshots.id))
    .where(and(...conditions))
    .orderBy(desc(ocrResults.timestamp))
    .limit(OCR_SEARCH_LIMIT)
    .all()

  return rows.map((r) => ({
    screenshot_id: r.screenshotId,
    timestamp: r.timestamp,
    text_snippet: r.textSnippet,
    display_id: r.displayId,
    file_path: r.filePath
  }))
}
