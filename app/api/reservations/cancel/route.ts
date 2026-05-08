import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getAuthedMember } from '@/lib/member-auth'

export const runtime = 'nodejs'

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
  if (!presentation_id) {
    return NextResponse.json({ error: 'presentation_id required' }, { status: 400 })
  }

  const supabase = supabaseAdmin()
  const { data, error } = await supabase.rpc('cancel_presentation_slot', {
    p_member_id: me.id,
    p_presentation_id: presentation_id
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result = data as { success: boolean; error?: string }
  if (!result.success) {
    return NextResponse.json({ error: result.error || '취소 실패' }, { status: 400 })
  }
  return NextResponse.json(result)
}
