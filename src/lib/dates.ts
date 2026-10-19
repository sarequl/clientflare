/** Today's date (YYYY-MM-DD) in an IANA timezone. Falls back to UTC on a bad zone. */
export function todayIn(timezone: string, at = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at)
  } catch {
    return at.toISOString().slice(0, 10)
  }
}
