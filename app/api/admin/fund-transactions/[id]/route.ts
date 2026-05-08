import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const VALID_CATEGORIES = new Set([
  'studyroom',
  'meal',
  'snack',
  'gift',
  'penalty',
  'membership',
  'other'
])

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
  if (typeof body.amount === 'number' && Number.isFinite(body.amount) && body.amount !== 0) {
    update.amount = Math.floor(body.amount)
  }
  if (typeof body.category === 'string' && VALID_CATEGORIES.has(body.category)) {
    update.category = body.category
  }
  if (typeof body.description === 'string') {
    update.description = body.description.trim() || null
  }
  if (typeof body.date === 'string' && body.date) update.date = body.date

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no valid fields' }, { status: 400 })
  }

  const supabase = supabaseAdmin()
  const { error } = await supabase.from('fund_transactions').update(update).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = supabaseAdmin()
  const { error } = await supabase.from('fund_transactions').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
