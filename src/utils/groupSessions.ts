import type { Session } from '~/components/Sidebar'

export interface GroupedSessions {
  today: Session[]
  yesterday: Session[]
  thisWeek: Session[]
  older: Session[]
}

/** Group sessions berdasarkan updated_at: hari ini, kemarin, minggu ini, lebih lama. */
export function groupSessionsByTime(sessions: Session[]): GroupedSessions {
  const now = new Date()
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)

  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)

  const startOfWeek = new Date(startOfToday)
  startOfWeek.setDate(startOfWeek.getDate() - 7)

  const today: Session[] = []
  const yesterday: Session[] = []
  const thisWeek: Session[] = []
  const older: Session[] = []

  for (const s of sessions) {
    const t = new Date(s.updated_at).getTime()
    if (Number.isNaN(t)) {
      older.push(s)
      continue
    }
    if (t >= startOfToday.getTime()) today.push(s)
    else if (t >= startOfYesterday.getTime()) yesterday.push(s)
    else if (t >= startOfWeek.getTime()) thisWeek.push(s)
    else older.push(s)
  }

  return { today, yesterday, thisWeek, older }
}
