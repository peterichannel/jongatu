import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getAuthedMember } from '@/lib/member-auth'

export const runtime = 'nodejs'

// 스터디 시작/지각 기준 (Asia/Seoul)
const LATE_HOUR = 19
const LATE_MINUTE = 20

function seoulNow() {
  // Vercel/대부분의 서버는 UTC. Asia/Seoul = UTC+9
  const now = new Date()
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000
  return new Date(utcMs + 9 * 3600_000)
}

function dateOnly(d: Date) {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

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
    .select('id, date, type, quarter_id, is_test')
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

  const now = seoulNow()
  const today = dateOnly(now)
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

  const hour = now.getHours()
  const minute = now.getMinutes()
  const isLate = hour > LATE_HOUR || (hour === LATE_HOUR && minute >= LATE_MINUTE)
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

  const checkedInAt = now.toISOString()
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

  return NextResponse.json({
    ok: true,
    status,
    checked_in_at: checkedInAt,
    is_late: isLate
  })
}
