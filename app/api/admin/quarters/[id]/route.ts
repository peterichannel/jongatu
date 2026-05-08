import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim()) update.name = body.name.trim()
  if (typeof body.start_date === 'string' && body.start_date) update.start_date = body.start_date
  if (typeof body.end_date === 'string' && body.end_date) update.end_date = body.end_date
  if (typeof body.default_deposit === 'number' && Number.isFinite(body.default_deposit)) {
    update.default_deposit = Math.max(0, Math.floor(body.default_deposit))
  }
  if (typeof body.operating_fee === 'number' && Number.isFinite(body.operating_fee)) {
    update.operating_fee = Math.max(0, Math.floor(body.operating_fee))
  }
  if (typeof body.is_active === 'boolean') update.is_active = body.is_active

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no valid fields' }, { status: 400 })
  }

  const supabase = supabaseAdmin()

  if (update.is_active === true) {
    const { error: deactivateError } = await supabase
      .from('quarters')
      .update({ is_active: false })
      .neq('id', params.id)
    if (deactivateError) return NextResponse.json({ error: deactivateError.message }, { status: 500 })
  }

  const { error } = await supabase.from('quarters').update(update).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
