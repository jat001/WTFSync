function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** Compact local time: `14:05`, `昨天 14:05`, `8月25日 05:46` or a full date. */
export function formatTime(ms: number, now = Date.now()): string {
  const date = new Date(ms)
  const today = new Date(now)
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  if (isSameDay(date, today)) return time

  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (isSameDay(date, yesterday)) return `昨天 ${time}`

  if (date.getFullYear() === today.getFullYear()) {
    return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`
  }
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${time}`
}
