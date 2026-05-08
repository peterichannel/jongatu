import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// 회차 일괄 등록
// body: {
//   quarter_id: UUID,
//   start_date: 'YYYY-MM-DD',
//   count: number,             // 회차 수
//   interval_weeks: 1 | 2,     // 1=매주, 2=격주
//   slots_per_session: number, // 0~3 (0이면 발표 없음)
//   start_session_number?: number  // 미지정 시 기존 max + 1
// }
//
// 모든 회차는 type='normal'. 슬롯은 presenter_id=NULL 인 빈 슬롯으로 생성.
// special 슬롯/event 회차는 별도 폼에서 운용.

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  const yy = dt.getUTCFullYear()
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(dt.getUTCDate()).padStart(2, '0')
  return `${yy}-${mm}-${dd}`
}

export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const quarter_id = typeof body.quarter_id === 'string' ? body.quarter_id : ''
  const start_date = typeof body.start_date === 'string' ? body.start_date : ''
  const count =
    typeof body.count === 'number' && Number.isFinite(body.count)
      ? Math.max(1, Math.min(30, Math.floor(body.count)))
      : 0
  const interval_weeks =
    typeof body.interval_weeks === 'number' &&
    (body.interval_weeks === 1 || body.interval_weeks === 2)
      ? body.interval_weeks
      : 1
  const slots_per_session =
    typeof body.slots_per_session === 'number' && Number.isFinite(body.slots_per_session)
      ? Math.max(0, Math.min(3, Math.floor(body.slots_per_session)))
      : 0
  const explicitStart =
    typeof body.start_session_number === 'number' && Number.isFinite(body.start_session_number)
      ? Math.max(1, Math.floor(body.start_session_number))
      : null

  if (!quarter_id || !start_date || !count) {
    return NextResponse.json(
      { error: 'quarter_id, start_date, count required' },
      { status: 400 }
    )
  }

  const supabase = supabaseAdmin()

  // 분기 존재 확인 + 시작 회차 번호 산정
  const { data: existing, error: exErr } = await supabase
    .from('sessions')
    .select('session_number')
    .eq('quarter_id', quarter_id)
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 })
  const maxNum = (existing ?? []).reduce(
    (acc, s) => Math.max(acc, s.session_number),
    0
  )
  const startNum = explicitStart ?? maxNum + 1

  const createdSessions: { id: string; session_number: number; date: string }[] = []
  let createdSlots = 0
  const errors: string[] = []

  for (let i = 0; i < count; i++) {
    const session_number = startNum + i
    const date = addDays(start_date, i * 7 * interval_weeks)
    const { data: ses, error: sErr } = await supabase
      .from('sessions')
      .insert({ quarter_id, session_number, date, type: 'normal', note: null })
      .select('id, session_number, date')
      .single()
    if (sErr || !ses) {
      errors.push(`#${session_number} (${date}): ${sErr?.message ?? 'insert 실패'}`)
      continue
    }
    createdSessions.push(ses)

    if (slots_per_session > 0) {
      const slotRows = Array.from({ length: slots_per_session }).map((_, idx) => ({
        session_id: ses.id,
        slot: idx + 1,
        presenter_id: null,
        company_name: null,
        cafe_url: null,
        special_label: null,
        reserved_at: null
      }))
      const { error: pErr } = await supabase.from('presentations').insert(slotRows)
      if (pErr) {
        errors.push(`#${session_number} 슬롯: ${pErr.message}`)
      } else {
        createdSlots += slots_per_session
      }
    }
  }

  return NextResponse.json({
    created_sessions: createdSessions.length,
    created_slots: createdSlots,
    sessions: createdSessions,
    errors
  })
}
