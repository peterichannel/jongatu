import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const VALID_STATUS = new Set(['present', 'late', 'absent', 'excused'])

export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const session_id = typeof body.session_id === 'string' ? body.session_id : ''
  const member_id = typeof body.member_id === 'string' ? body.member_id : ''
  const status = typeof body.status === 'string' ? body.status : ''
  const checked_in_at =
    typeof body.checked_in_at === 'string' ? body.checked_in_at : new Date().toISOString()

  if (!session_id || !member_id || !VALID_STATUS.has(status)) {
    return NextResponse.json({ error: 'invalid input' }, { status: 400 })
  }

  const supabase = supabaseAdmin()

  const { data: session, error: sErr } = await supabase
    .from('sessions')
    .select('id, type')
    .eq('id', session_id)
    .maybeSingle()
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 })
  if (!session) return NextResponse.json({ error: 'session not found' }, { status: 404 })

  const { data: existing } = await supabase
    .from('attendances')
    .select('id, is_confirmed')
    .eq('session_id', session_id)
    .eq('member_id', member_id)
    .maybeSingle()
  if (existing?.is_confirmed) {
    return NextResponse.json(
      { error: '이미 확정된 출결은 변경할 수 없습니다' },
      { status: 400 }
    )
  }

  const { error: upErr } = await supabase
    .from('attendances')
    .upsert(
      { session_id, member_id, status, checked_in_at },
      { onConflict: 'session_id,member_id' }
    )
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  // 운영자 정정 시에도 페널티 즉시 동기화 (status 변경에 따라 reversal + 재적용)
  const { error: penaltyErr } = await supabase.rpc('apply_attendance_penalty', {
    p_session_id: session_id,
    p_member_id: member_id
  })
  if (penaltyErr) return NextResponse.json({ error: penaltyErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
