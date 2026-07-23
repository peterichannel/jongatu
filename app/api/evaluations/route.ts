import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getAuthedMember } from '@/lib/member-auth'
import { canEvaluateAttendance } from '@/lib/seoul-time'

export const runtime = 'nodejs'

function inRange(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 1 && n <= 5
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
    .from('evaluations')
    .select('*')
    .eq('session_id', session_id)
    .eq('evaluator_id', me.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ evaluations: data ?? [] })
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

  const presentation_id = typeof body.presentation_id === 'string' ? body.presentation_id : ''
  const session_id = typeof body.session_id === 'string' ? body.session_id : ''
  const preparation = body.preparation
  const delivery = body.delivery
  const qna = body.qna
  const time_management = body.time_management
  const attractiveness = body.attractiveness
  const feedback = typeof body.feedback === 'string' ? body.feedback.trim() : ''

  if (!presentation_id || !session_id) {
    return NextResponse.json({ error: 'invalid input' }, { status: 400 })
  }
  if (
    !inRange(preparation) ||
    !inRange(delivery) ||
    !inRange(qna) ||
    !inRange(time_management) ||
    !inRange(attractiveness)
  ) {
    return NextResponse.json({ error: '5개 항목 모두 1~5 사이로 평가해주세요' }, { status: 400 })
  }
  if (!feedback) {
    return NextResponse.json({ error: '종합 피드백은 필수입니다' }, { status: 400 })
  }

  const supabase = supabaseAdmin()

  const { data: presentation, error: pErr } = await supabase
    .from('presentations')
    .select('id, presenter_id, session_id')
    .eq('id', presentation_id)
    .maybeSingle()
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
  if (!presentation) return NextResponse.json({ error: '발표를 찾을 수 없습니다' }, { status: 404 })
  if (presentation.session_id !== session_id) {
    return NextResponse.json({ error: 'session_id 불일치' }, { status: 400 })
  }
  if (!presentation.presenter_id) {
    return NextResponse.json({ error: '평가 대상이 아닌 슬롯입니다' }, { status: 400 })
  }
  if (presentation.presenter_id === me.id) {
    return NextResponse.json({ error: '본인 발표는 평가할 수 없습니다' }, { status: 400 })
  }

  // 출석/지각한 회원만 평가 가능 — 결석·공결·미체크(레코드 없음)는 403.
  // 관리자도 동일 규칙(평가 데이터 신뢰도 우선).
  const { data: myAtt, error: aErr } = await supabase
    .from('attendances')
    .select('status')
    .eq('session_id', session_id)
    .eq('member_id', me.id)
    .maybeSingle()
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 })
  if (!canEvaluateAttendance(myAtt?.status)) {
    return NextResponse.json(
      { error: '출석하지 않은 회차는 평가할 수 없습니다' },
      { status: 403 }
    )
  }

  const { error: upErr } = await supabase
    .from('evaluations')
    .upsert(
      {
        evaluator_id: me.id,
        presentation_id,
        session_id,
        preparation,
        delivery,
        qna,
        time_management,
        attractiveness,
        feedback
      },
      { onConflict: 'evaluator_id,presentation_id' }
    )
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
