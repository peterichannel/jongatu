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

// ── 스터디 시각 상수 (자정 기준 분 단위, sessions.late_after_minutes 와 같은 컨벤션)
// 스터디는 매주 수요일 19:00 KST 시작 고정. 회차마다 달라지면 sessions 에 start_time 컬럼을 추가한다.
export const STUDY_START_MINUTES = 19 * 60 // 19:00
// 사전참석 답변 마감 = 스터디 시작 10분 전 (운영진 인원 파악 최소 시간)
export const PRE_ATTENDANCE_CUTOFF_MINUTES = STUDY_START_MINUTES - 10 // 18:50

// 스터디 종료 예상 시각 = 21:00 KST. 평가 노출/제출의 하한(진행 중 평가 방지).
export const STUDY_END_MINUTES = 21 * 60 // 21:00

// 자정 기준 분 → '오후 6시 50분'
export function formatMinutesKR(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const ampm = h < 12 ? '오전' : '오후'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return m === 0 ? `${ampm} ${h12}시` : `${ampm} ${h12}시 ${m}분`
}

// 스터디 시작(19:00 KST) 이전인지 — 출석 체크 취소 가능 여부 판정에 사용.
// 19:00 이후 취소는 곧 자기 결석 처리라 허용하지 않는다.
export function isBeforeStudyStart(now: Date = new Date()): boolean {
  return seoulMinutesOfDay(now) < STUDY_START_MINUTES
}

// 해당 회차의 사전참석 답변이 아직 가능한지 (회차 당일 18:50 KST 마감)
export function isPreAttendanceOpen(sessionDate: string, now: Date = new Date()): boolean {
  const today = seoulDateISO(now)
  if (sessionDate > today) return true
  if (sessionDate < today) return false
  return seoulMinutesOfDay(now) < PRE_ATTENDANCE_CUTOFF_MINUTES
}

// 해당 회차 평가가 가능한 시점인지 — 스터디 종료(21:00 KST) 이후.
// 지난 회차는 항상 열려 있고, 당일 회차는 21:00 이후에만 열린다(진행 중 평가 방지).
export function isEvaluationOpen(sessionDate: string, now: Date = new Date()): boolean {
  const today = seoulDateISO(now)
  if (sessionDate < today) return true
  if (sessionDate > today) return false
  return seoulMinutesOfDay(now) >= STUDY_END_MINUTES
}

// 출석/지각한 회원만 평가할 수 있다. 결석·공결·미체크(레코드 없음)는 제외.
export function canEvaluateAttendance(status: string | null | undefined): boolean {
  return status === 'present' || status === 'late'
}

// 'YYYY-MM-DD' 에 days를 더한 KST 날짜 ISO. days 가 음수면 빼는 효과.
export function addDaysSeoulISO(date: string, days: number): string {
  const t = new Date(`${date}T00:00:00+09:00`).getTime() + days * 24 * 3600_000
  return seoulDateISO(new Date(t))
}
