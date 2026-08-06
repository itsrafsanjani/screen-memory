/**
 * Local-time bounds of a `YYYY-MM-DD` day, as epoch milliseconds. Shared by the
 * repositories so a day means the same thing everywhere.
 */
export function dayStartEnd(dateStr: string): { start: number; end: number } {
  const [year, month, day] = dateStr.split('-').map(Number)
  return {
    start: new Date(year, month - 1, day, 0, 0, 0, 0).getTime(),
    end: new Date(year, month - 1, day, 23, 59, 59, 999).getTime()
  }
}
