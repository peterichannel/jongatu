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
  if (typeof body.slot === 'number' && Number.isFinite(body.slot)) {
    update.slot = Math.max(1, Math.floor(body.slot))
  }
  if ('presenter_id' in body) {
    const v = body.presenter_id
    if (v === null || v === '') {
      update.presenter_id = null
      update.reserved_at = null
    } else if (typeof v === 'string') {
      update.presenter_id = v
      update.reserved_at = new Date().toISOString()
    } else {
      return NextResponse.json({ error: 'invalid presenter_id' }, { status: 400 })
    }
  }
  if (typeof body.company_name === 'string') {
    update.company_name = body.company_name.trim() || null
    update.company_updated_at = new Date().toISOString()
  }
  if (typeof body.cafe_url === 'string') {
    update.cafe_url = body.cafe_url.trim() || null
  }
  if ('special_label' in body) {
    update.special_label =
      typeof body.special_label === 'string' && body.special_label.trim()
        ? body.special_label.trim()
        : null
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no valid fields' }, { status: 400 })
  }

  const supabase = supabaseAdmin()
  const { error } = await supabase.from('presentations').update(update).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = supabaseAdmin()
  const { error } = await supabase.from('presentations').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
