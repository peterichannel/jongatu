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
  const company_name = typeof body.company_name === 'string' ? body.company_name : ''
  if (!presentation_id) {
    return NextResponse.json({ error: 'presentation_id required' }, { status: 400 })
  }

  const supabase = supabaseAdmin()
  const { data, error } = await supabase.rpc('update_presentation_company', {
    p_member_id: me.id,
    p_presentation_id: presentation_id,
    p_company_name: company_name
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result = data as { success: boolean; error?: string; company_name?: string | null }
  if (!result.success) {
    return NextResponse.json({ error: result.error || '저장 실패' }, { status: 400 })
  }
  return NextResponse.json(result)
}
