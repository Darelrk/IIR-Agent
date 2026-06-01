/** Format ISO timestamp ke relative time Indonesia (mis. "5 menit lalu", "kemarin"). */
export function formatRelativeTime(timestamp: string | number | Date): string {
  const t = new Date(timestamp).getTime()
  if (Number.isNaN(t)) return ''

  const diffMs = Date.now() - t
  const diffSec = Math.round(diffMs / 1000)
  const diffMin = Math.round(diffSec / 60)
  const diffHour = Math.round(diffMin / 60)
  const diffDay = Math.round(diffHour / 24)

  if (diffSec < 30) return 'baru saja'
  if (diffMin < 1) return `${diffSec}d lalu`
  if (diffMin < 60) return `${diffMin}m lalu`
  if (diffHour < 24) return `${diffHour}j lalu`
  if (diffDay === 1) return 'kemarin'
  if (diffDay < 7) return `${diffDay}h lalu`

  // Older: short date dd MMM (id-ID)
  return new Date(t).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
  })
}
