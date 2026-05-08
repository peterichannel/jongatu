import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const session_id = typeof body.session_id === 'string' ? body.session_id : ''
  const slot =
    typeof body.slot === 'number' && Number.isFinite(body.slot)
      ? Math.max(1, Math.floor(body.slot))
      : 0
  const presenter_id =
    typeof body.presenter_id === 'string' && body.presenter_id ? body.presenter_id : null
  const company_name =
    typeof body.company_name === 'string' && body.company_name.trim()
      ? body.company_name.trim()
      : null
  const cafe_url =
    typeof body.cafe_url === 'string' && body.cafe_url.trim() ? body.cafe_url.trim() : null
  const special_label =
    typeof body.special_label === 'string' && body.special_label.trim()
      ? body.special_label.trim()
      : null

  if (!session_id || !slot) {
    return NextResponse.json({ error: 'session_id, slot required' }, { status: 400 })
  }

  const supabase = supabaseAdmin()
  const { data, error } = await supabase
    .from('presentations')
    .insert({
      session_id,
      slot,
      presenter_id,
      company_name,
      cafe_url,
      special_label,
      reserved_at: presenter_id ? new Date().toISOString() : null
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
