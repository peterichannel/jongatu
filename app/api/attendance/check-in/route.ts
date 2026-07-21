import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getAuthedMember } from '@/lib/member-auth'
import { seoulDateISO, seoulMinutesOfDay, STUDY_START_MINUTES } from '@/lib/seoul-time'

export const runtime = 'nodejs'

// 기본 지각 기준 (Asia/Seoul) — 회차에 late_after_minutes 가 설정되면 그 값을 우선 사용
const DEFAULT_LATE_HOUR = 19
const DEFAULT_LATE_MINUTE = 20
const DEFAULT_LATE_MINUTES = DEFAULT_LATE_HOUR * 60 + DEFAULT_LATE_MINUTE

export async function POST(req: Request) {
  const me = await getAuthedMember()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    /* 빈 바디 허용 */
  }

  const session_id = typeof body.session_id === 'string' ? body.session_id : ''
  if (!session_id) {
    return NextResponse.json({ error: 'session_id required' }, { status: 400 })
  }

  const supabase = supabaseAdmin()

  const { data: session, error: sErr } = await supabase
    .from('sessions')
    .select('id, date, type, quarter_id, is_test, late_after_minutes')
    .eq('id', session_id)
    .maybeSingle()
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 })
  if (!session) return NextResponse.json({ error: '회차를 찾을 수 없습니다' }, { status: 404 })
  if (session.type !== 'normal') {
    return NextResponse.json({ error: '정상 회차만 출석 체크 가능합니다' }, { status: 400 })
  }
  if (session.is_test && !me.is_admin) {
    return NextResponse.json({ error: '테스트 회차는 운영진만 체크 가능합니다' }, { status: 403 })
  }

  const today = seoulDateISO()
  if (session.date !== today) {
    return NextResponse.json(
      { error: `오늘(${today}) 회차가 아닙니다 (회차일: ${session.date})` },
      { status: 400 }
    )
  }

  // 이미 운영자가 확정한 회차면 자가 체크 불가
  const { data: anyConfirmed } = await supabase
    .from('attendances')
    .select('id')
    .eq('session_id', session_id)
    .eq('is_confirmed', true)
    .limit(1)
  if (anyConfirmed && anyConfirmed.length > 0) {
    return NextResponse.json({ error: '이미 출결이 확정된 회차입니다' }, { status: 400 })
  }

  const nowMinutes = seoulMinutesOfDay()
  const lateThresholdMinutes =
    typeof session.late_after_minutes === 'number' && session.late_after_minutes >= 0
      ? session.late_after_minutes
      : DEFAULT_LATE_MINUTES
  const isLate = nowMinutes >= lateThresholdMinutes
  const status: 'present' | 'late' = isLate ? 'late' : 'present'

  // 기존 행이 있으면 status, checked_in_at 갱신 (운영자가 미리 입력했더라도 자가 체크 우선)
  const { data: existing } = await supabase
    .from('attendances')
    .select('id, status, is_confirmed')
    .eq('session_id', session_id)
    .eq('member_id', me.id)
    .maybeSingle()

  if (existing?.is_confirmed) {
    return NextResponse.json({ error: '이미 확정된 출결은 변경할 수 없습니다' }, { status: 400 })
  }

  // ISO string은 UTC 기준 절대 시각이라 환경 무관하게 정확. 표시는 toLocaleTimeString(timeZone:'Asia/Seoul')에서 처리
  const checkedInAt = new Date().toISOString()
  if (existing) {
    const { error } = await supabase
      .from('attendances')
      .update({ status, checked_in_at: checkedInAt })
      .eq('id', existing.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await supabase.from('attendances').insert({
      session_id,
      member_id: me.id,
      status,
      checked_in_at: checkedInAt,
      is_confirmed: false
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 즉시 페널티 동기화 (지각이면 -3,000원 차감, 출석은 무차감 + 기존 페널티 reversal)
  const { error: penaltyErr } = await supabase.rpc('apply_attendance_penalty', {
    p_session_id: session_id,
    p_member_id: me.id
  })
  if (penaltyErr) return NextResponse.json({ error: penaltyErr.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    status,
    checked_in_at: checkedInAt,
    is_late: isLate
  })
}

// 출석 체크 취소 — 스터디 시작(19:00 KST) 전에만 허용.
// 시작 후 취소는 곧 자기 결석 처리라 서버에서 거부한다. 클라 UI 숨김만으로는 부족.
export async function DELETE(req: Request) {
  const me = await getAuthedMember()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    /* 빈 바디 허용 */
  }

  const session_id = typeof body.session_id === 'string' ? body.session_id : ''
  if (!session_id) {
    return NextResponse.json({ error: 'session_id required' }, { status: 400 })
  }

  const supabase = supabaseAdmin()

  const { data: session, error: sErr } = await supabase
    .from('sessions')
    .select('id, date, type')
    .eq('id', session_id)
    .maybeSingle()
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 })
  if (!session) return NextResponse.json({ error: '회차를 찾을 수 없습니다' }, { status: 404 })

  // 오늘 회차가 아니면 이미 지난 스터디 → 취소 불가
  const today = seoulDateISO()
  if (session.date !== today) {
    return NextResponse.json(
      { error: '오늘 회차가 아니라 취소할 수 없습니다' },
      { status: 403 }
    )
  }

  // 스터디 시작 후 취소 금지 (미체크 = 결석 이므로)
  if (seoulMinutesOfDay() >= STUDY_START_MINUTES) {
    return NextResponse.json(
      { error: '스터디 시작 후에는 취소할 수 없습니다' },
      { status: 403 }
    )
  }

  // 확정된 출결은 취소 불가 (운영자 정정 영역)
  const { data: existing } = await supabase
    .from('attendances')
    .select('id, is_confirmed')
    .eq('session_id', session_id)
    .eq('member_id', me.id)
    .maybeSingle()
  if (!existing) {
    return NextResponse.json({ error: '체크 기록이 없습니다' }, { status: 404 })
  }
  if (existing.is_confirmed) {
    return NextResponse.json(
      { error: '출결이 확정되어 취소할 수 없습니다' },
      { status: 403 }
    )
  }

  const { error: delErr } = await supabase
    .from('attendances')
    .delete()
    .eq('id', existing.id)
  if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })

  // 페널티 동기화 — 행이 사라졌으므로 지각 페널티 reversal + (사전참석 미응답 시) 재적용
  const { error: penaltyErr } = await supabase.rpc('apply_attendance_penalty', {
    p_session_id: session_id,
    p_member_id: me.id
  })
  if (penaltyErr) return NextResponse.json({ error: penaltyErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
