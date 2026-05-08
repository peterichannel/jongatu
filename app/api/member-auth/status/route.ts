import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const runtime = 'nodejs'

// 멤버 PIN 설정 여부 조회 (홈 화면이 setup/verify 분기 결정)
export async function GET(req: Request) {
  const url = new URL(req.url)
  const member_id = url.searchParams.get('member_id') || ''
  if (!member_id) return NextResponse.json({ error: 'member_id required' }, { status: 400 })

  const supabase = supabaseAdmin()
  const { data, error } = await supabase
    .from('members')
    .select('id, pin_hash, is_active')
    .eq('id', member_id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || !data.is_active) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  return NextResponse.json({ has_pin: !!data.pin_hash })
}
