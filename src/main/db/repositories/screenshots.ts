import { and, asc, eq, gte, lte, sql } from 'drizzle-orm'
import { getDb } from '../client'
import { dayStartEnd } from '../day-range'
import { screenshots } from '../schema'

export interface ScreenshotRow {
  id: number
  timestamp: number
  display_id: string
  file_path: string
  width: number | null
  height: number | null
  file_size: number | null
  is_idle: number
}

function toRow(r: {
  id: number
  timestamp: number
  displayId: string
  filePath: string
  width: number | null
  height: number | null
  fileSize: number | null
  isIdle: number
}): ScreenshotRow {
  return {
    id: r.id,
    timestamp: r.timestamp,
    display_id: r.displayId,
    file_path: r.filePath,
    width: r.width,
    height: r.height,
    file_size: r.fileSize,
    is_idle: r.isIdle
  }
}

export function insertScreenshot(record: {
  timestamp: number
  display_id: string
  file_path: string
  width: number
  height: number
  file_size: number
  is_idle: boolean
}): number {
  const db = getDb()
  const result = db
    .insert(screenshots)
    .values({
      timestamp: record.timestamp,
      displayId: record.display_id,
      filePath: record.file_path,
      width: record.width,
      height: record.height,
      fileSize: record.file_size,
      isIdle: record.is_idle ? 1 : 0
    })
    .returning({ id: screenshots.id })
    .get()
  return result.id
}

export function getScreenshotsByDate(dateStr: string): ScreenshotRow[] {
  const { start, end } = dayStartEnd(dateStr)
  return getScreenshotsByTimeRange(start, end)
}

export function getScreenshotsByTimeRange(start: number, end: number): ScreenshotRow[] {
  const db = getDb()
  const rows = db
    .select()
    .from(screenshots)
    .where(and(gte(screenshots.timestamp, start), lte(screenshots.timestamp, end)))
    .orderBy(asc(screenshots.timestamp))
    .all()
  return rows.map(toRow)
}

export function getAvailableDates(): string[] {
  const db = getDb()
  const rows = db
    .select({
      day: sql<string>`date(${screenshots.timestamp} / 1000, 'unixepoch', 'localtime')`.as('day')
    })
    .from(screenshots)
    .groupBy(sql`day`)
    .orderBy(sql`day desc`)
    .all()
  return rows.map((r) => r.day)
}

export function getDayBounds(dateStr: string): { first: number; last: number } | null {
  const { start, end } = dayStartEnd(dateStr)
  const db = getDb()
  const row = db
    .select({
      first: sql<number | null>`min(${screenshots.timestamp})`,
      last: sql<number | null>`max(${screenshots.timestamp})`
    })
    .from(screenshots)
    .where(and(gte(screenshots.timestamp, start), lte(screenshots.timestamp, end)))
    .get()
  if (!row || row.first === null || row.last === null) return null
  return { first: row.first, last: row.last }
}

export function deleteScreenshotsOlderThan(timestampMs: number): number {
  const db = getDb()
  const result = db
    .delete(screenshots)
    .where(sql`${screenshots.timestamp} < ${timestampMs}`)
    .run()
  return result.changes
}

export function getScreenshotById(id: number): ScreenshotRow | null {
  const db = getDb()
  const row = db.select().from(screenshots).where(eq(screenshots.id, id)).get()
  return row ? toRow(row) : null
}
