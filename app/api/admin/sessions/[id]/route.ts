import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const VALID_TYPES = ['normal', 'rest', 'dinner', 'social', 'event']

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
  if (typeof body.session_number === 'number' && Number.isFinite(body.session_number)) {
    update.session_number = Math.max(1, Math.floor(body.session_number))
  }
  if (typeof body.date === 'string' && body.date) update.date = body.date
  if (typeof body.type === 'string' && VALID_TYPES.includes(body.type)) update.type = body.type
  if (typeof body.note === 'string') update.note = body.note.trim() || null

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no valid fields' }, { status: 400 })
  }

  const supabase = supabaseAdmin()
  const { error } = await supabase.from('sessions').update(update).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = supabaseAdmin()
  const { error } = await supabase.from('sessions').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
