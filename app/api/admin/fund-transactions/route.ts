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

export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const half_id = typeof body.half_id === 'string' ? body.half_id : ''
  const amount =
    typeof body.amount === 'number' && Number.isFinite(body.amount)
      ? Math.floor(body.amount)
      : NaN
  const category = typeof body.category === 'string' ? body.category : ''
  const description =
    typeof body.description === 'string' && body.description.trim()
      ? body.description.trim()
      : null
  const date = typeof body.date === 'string' && body.date ? body.date : ''

  if (!half_id || !date || !VALID_CATEGORIES.has(category) || !Number.isFinite(amount) || amount === 0) {
    return NextResponse.json({ error: 'invalid input' }, { status: 400 })
  }

  const supabase = supabaseAdmin()
  const { data, error } = await supabase
    .from('fund_transactions')
    .insert({ half_id, amount, category, description, date })
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
