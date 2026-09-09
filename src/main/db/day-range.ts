export function dayStartEnd(dateStr: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!match) {
    throw new Error(`Invalid date: expected YYYY-MM-DD, got ${dateStr}`)
  }
  const [, yearStr, monthStr, dayStr] = match
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)
  const start = new Date(year, month - 1, day, 0, 0, 0, 0)

  if (start.getFullYear() !== year || start.getMonth() !== month - 1 || start.getDate() !== day) {
    throw new Error(`Invalid date: ${dateStr} is not a real calendar day`)
  }

  return {
    start: start.getTime(),
    end: new Date(year, month - 1, day, 23, 59, 59, 999).getTime()
  }
}
