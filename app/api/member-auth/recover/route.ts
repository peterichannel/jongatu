import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { hashPin, normalizeRecoveryAnswer, setMemberCookies } from '@/lib/member-auth'

export const runtime = 'nodejs'

// 본인이 PIN을 잊었을 때:
// 1) 이름(member_id) + 어머니 성함(recovery_answer) + 새 PIN 입력
// 2) 어머니 성함이 일치하면 새 PIN 으로 즉시 재설정 + 자동 로그인
export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const member_id = typeof body.member_id === 'string' ? body.member_id : ''
  const recoveryRaw = typeof body.recovery_answer === 'string' ? body.recovery_answer : ''
  const new_pin = typeof body.new_pin === 'string' ? body.new_pin : ''

  if (!member_id) {
    return NextResponse.json({ error: 'member_id required' }, { status: 400 })
  }
  const normalized = normalizeRecoveryAnswer(recoveryRaw)
  if (!normalized) {
    return NextResponse.json({ error: '어머니 성함을 입력해주세요' }, { status: 400 })
  }
  if (!/^\d{4,8}$/.test(new_pin)) {
    return NextResponse.json({ error: '새 PIN은 4~8자리 숫자입니다' }, { status: 400 })
  }

  const supabase = supabaseAdmin()
  const { data: member, error } = await supabase
    .from('members')
    .select('id, name, is_active, recovery_answer')
    .eq('id', member_id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!member || !member.is_active) {
    return NextResponse.json({ error: '멤버를 찾을 수 없습니다' }, { status: 404 })
  }

  if (!member.recovery_answer) {
    return NextResponse.json(
      {
        error:
          '본인 확인 답변이 등록되지 않았습니다. 운영자에게 PIN 재설정을 요청해주세요'
      },
      { status: 400 }
    )
  }

  if (member.recovery_answer !== normalized) {
    return NextResponse.json(
      { error: '어머니 성함이 일치하지 않습니다' },
      { status: 401 }
    )
  }

  const newHash = await hashPin(new_pin)
  const { error: upErr } = await supabase
    .from('members')
    .update({ pin_hash: newHash })
    .eq('id', member_id)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  setMemberCookies(member.id, newHash)
  return NextResponse.json({ ok: true, name: member.name })
}
