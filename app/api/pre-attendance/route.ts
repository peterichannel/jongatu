import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getAuthedMember } from '@/lib/member-auth'

export const runtime = 'nodejs'

const VALID_STATUS = new Set(['attending', 'absent'])

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export async function GET(req: Request) {
  const me = await getAuthedMember()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const session_id = url.searchParams.get('session_id') || ''
  if (!session_id) {
    return NextResponse.json({ error: 'session_id required' }, { status: 400 })
  }
  const supabase = supabaseAdmin()
  const { data, error } = await supabase
    .from('pre_attendances')
    .select('*')
    .eq('session_id', session_id)
    .eq('member_id', me.id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pre_attendance: data })
}

export async function POST(req: Request) {
  const me = await getAuthedMember()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const session_id = typeof body.session_id === 'string' ? body.session_id : ''
  const status = typeof body.status === 'string' ? body.status : ''
  const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : null

  if (!session_id || !VALID_STATUS.has(status)) {
    return NextResponse.json({ error: 'invalid input' }, { status: 400 })
  }

  const supabase = supabaseAdmin()

  const { data: session, error: sErr } = await supabase
    .from('sessions')
    .select('id, date, type')
    .eq('id', session_id)
    .maybeSingle()
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 })
  if (!session) return NextResponse.json({ error: 'session not found' }, { status: 404 })
  if (session.type !== 'normal') {
    return NextResponse.json({ error: '정상 회차가 아닙니다' }, { status: 400 })
  }
  if (session.date < todayISO()) {
    return NextResponse.json({ error: '이미 지난 회차입니다' }, { status: 400 })
  }

  const { error: upErr } = await supabase
    .from('pre_attendances')
    .upsert(
      {
        session_id,
        member_id: me.id,
        status,
        reason,
        responded_at: new Date().toISOString()
      },
      { onConflict: 'session_id,member_id' }
    )
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
