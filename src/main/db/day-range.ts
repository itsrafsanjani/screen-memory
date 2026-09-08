/**
 * Local-time bounds of a `YYYY-MM-DD` day, as epoch milliseconds. Shared by the
 * repositories so a day means the same thing everywhere.
 */
export function dayStartEnd(dateStr: string): { start: number; end: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!match) {
    throw new Error(`Invalid date: expected YYYY-MM-DD, got ${dateStr}`)
  }
  const [, yearStr, monthStr, dayStr] = match
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)
  const start = new Date(year, month - 1, day, 0, 0, 0, 0)

  // `Date` normalizes out-of-range components (e.g. day 31 of a 30-day month)
  // to a different calendar day instead of rejecting them; reading the parts
  // back catches that silently-shifted case.
  if (start.getFullYear() !== year || start.getMonth() !== month - 1 || start.getDate() !== day) {
    throw new Error(`Invalid date: ${dateStr} is not a real calendar day`)
  }

  return {
    start: start.getTime(),
    end: new Date(year, month - 1, day, 23, 59, 59, 999).getTime()
  }
}
