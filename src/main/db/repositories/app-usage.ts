import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { getDb } from '../client'
import { dayStartEnd } from '../day-range'
import { appUsage } from '../schema'
import type { AppUsageSegment, AppUsageTotal } from '../../../shared/types'

function toRow(r: {
  id: number
  bundleId: string
  appName: string
  startedAt: number
  endedAt: number
  durationMs: number
}): AppUsageSegment {
  return {
    id: r.id,
    bundle_id: r.bundleId,
    app_name: r.appName,
    started_at: r.startedAt,
    ended_at: r.endedAt,
    duration_ms: r.durationMs
  }
}

/**
 * Opens a segment for an app that has just become frontmost. It is written
 * immediately with zero duration and grown by `touchSegment`, so an unclean
 * shutdown loses at most one poll interval instead of the whole segment.
 */
export function openSegment(segment: {
  bundleId: string
  appName: string
  startedAt: number
}): number {
  const db = getDb()
  const result = db
    .insert(appUsage)
    .values({
      bundleId: segment.bundleId,
      appName: segment.appName,
      startedAt: segment.startedAt,
      endedAt: segment.startedAt,
      durationMs: 0
    })
    .returning({ id: appUsage.id })
    .get()
  return result.id
}

export function touchSegment(id: number, endedAt: number): void {
  const db = getDb()
  db.update(appUsage)
    .set({ endedAt, durationMs: sql`max(0, ${endedAt} - ${appUsage.startedAt})` })
    .where(eq(appUsage.id, id))
    .run()
}

/** Segments overlapping the range, in start order. */
export function getUsageByRange(start: number, end: number): AppUsageSegment[] {
  const db = getDb()
  const rows = db
    .select()
    .from(appUsage)
    .where(and(lte(appUsage.startedAt, end), gte(appUsage.endedAt, start)))
    .orderBy(asc(appUsage.startedAt))
    .all()
  return rows.map(toRow)
}

export function getUsageByDate(dateStr: string): AppUsageSegment[] {
  const { start, end } = dayStartEnd(dateStr)
  return getUsageByRange(start, end)
}

/**
 * Per-app totals, with each segment clamped to the range so a segment that
 * straddles the boundary only contributes the part inside it.
 */
export function getUsageTotals(start: number, end: number): AppUsageTotal[] {
  const db = getDb()
  const clamped = sql<number>`sum(
    min(${appUsage.endedAt}, ${end}) - max(${appUsage.startedAt}, ${start})
  )`
  const rows = db
    .select({
      bundle_id: appUsage.bundleId,
      app_name: sql<string>`max(${appUsage.appName})`,
      duration_ms: clamped
    })
    .from(appUsage)
    .where(and(lte(appUsage.startedAt, end), gte(appUsage.endedAt, start)))
    .groupBy(appUsage.bundleId)
    .orderBy(desc(clamped))
    .all()
  return rows.map((r) => ({
    bundle_id: r.bundle_id,
    app_name: r.app_name,
    duration_ms: r.duration_ms ?? 0
  }))
}

export function deleteUsageOlderThan(timestampMs: number): number {
  const db = getDb()
  const result = db
    .delete(appUsage)
    .where(sql`${appUsage.endedAt} < ${timestampMs}`)
    .run()
  return result.changes
}
