import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const runtime = 'nodejs'

type Body = {
  name?: unknown
  start_date?: unknown
  end_date?: unknown
  default_deposit?: unknown
  operating_fee?: unknown
  is_active?: unknown
}

function parseBody(body: Body) {
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
  return update
}

export async function POST(req: Request) {
  let body: Body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }
  const update = parseBody(body)
  if (!update.name || !update.start_date || !update.end_date) {
    return NextResponse.json({ error: 'name, start_date, end_date required' }, { status: 400 })
  }

  const supabase = supabaseAdmin()

  if (update.is_active === true) {
    const { error: deactivateError } = await supabase
      .from('quarters')
      .update({ is_active: false })
      .eq('is_active', true)
    if (deactivateError) return NextResponse.json({ error: deactivateError.message }, { status: 500 })
  }

  const { data, error } = await supabase
    .from('quarters')
    .insert(update)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
