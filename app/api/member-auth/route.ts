import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import {
  comparePin,
  hashPin,
  normalizeRecoveryAnswer,
  setMemberCookies,
  clearMemberCookies
} from '@/lib/member-auth'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const member_id = typeof body.member_id === 'string' ? body.member_id : ''
  const pin = typeof body.pin === 'string' ? body.pin : ''
  const recoveryAnswerRaw =
    typeof body.recovery_answer === 'string' ? body.recovery_answer : ''

  if (!member_id || !/^\d{4,8}$/.test(pin)) {
    return NextResponse.json({ error: 'PIN은 4~8자리 숫자입니다' }, { status: 400 })
  }

  const supabase = supabaseAdmin()
  const { data: member, error } = await supabase
    .from('members')
    .select('id, name, is_active, pin_hash, recovery_answer')
    .eq('id', member_id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!member || !member.is_active) {
    return NextResponse.json({ error: '멤버를 찾을 수 없습니다' }, { status: 404 })
  }

  if (!member.pin_hash) {
    // setup: PIN + 본인 확인 답변(어머니 성함) 모두 받음
    const normalized = normalizeRecoveryAnswer(recoveryAnswerRaw)
    if (!normalized) {
      return NextResponse.json(
        { error: '본인 확인 답변(어머니 성함)을 입력해주세요' },
        { status: 400 }
      )
    }
    const newHash = await hashPin(pin)
    const { error: upErr } = await supabase
      .from('members')
      .update({ pin_hash: newHash, recovery_answer: normalized })
      .eq('id', member_id)
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
    setMemberCookies(member.id, newHash)
    return NextResponse.json({ ok: true, mode: 'setup', name: member.name })
  } else {
    // verify
    const ok = await comparePin(pin, member.pin_hash)
    if (!ok) return NextResponse.json({ error: 'PIN이 올바르지 않습니다' }, { status: 401 })
    setMemberCookies(member.id, member.pin_hash)
    return NextResponse.json({ ok: true, mode: 'verify', name: member.name })
  }
}

export async function DELETE() {
  clearMemberCookies()
  return NextResponse.json({ ok: true })
}
