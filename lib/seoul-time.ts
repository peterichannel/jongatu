// Asia/Seoul 시각 헬퍼.
// Intl.DateTimeFormat의 timeZone 옵션을 직접 써서 서버 타임존(Vercel UTC, 로컬 KST 등)에 의존하지 않음.

const PARTS_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
})

function parts(d: Date = new Date()) {
  const out: Record<string, string> = {}
  for (const p of PARTS_FORMATTER.formatToParts(d)) {
    if (p.type !== 'literal') out[p.type] = p.value
  }
  return out
}

export function seoulDateISO(d: Date = new Date()): string {
  // 'YYYY-MM-DD' (Asia/Seoul)
  const p = parts(d)
  return `${p.year}-${p.month}-${p.day}`
}

export function seoulHourMinute(d: Date = new Date()): { hour: number; minute: number } {
  const p = parts(d)
  // Intl이 24시간제에서 '24'를 반환하는 환경 보정
  const h = parseInt(p.hour, 10)
  return { hour: h === 24 ? 0 : h, minute: parseInt(p.minute, 10) }
}

export function seoulMinutesOfDay(d: Date = new Date()): number {
  const { hour, minute } = seoulHourMinute(d)
  return hour * 60 + minute
}

// 'YYYY-MM-DD' 에 days를 더한 KST 날짜 ISO. days 가 음수면 빼는 효과.
export function addDaysSeoulISO(date: string, days: number): string {
  const t = new Date(`${date}T00:00:00+09:00`).getTime() + days * 24 * 3600_000
  return seoulDateISO(new Date(t))
}
