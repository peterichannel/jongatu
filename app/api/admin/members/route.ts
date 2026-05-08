import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  let body: { name?: unknown; joined_at?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })

  const joined_at =
    typeof body.joined_at === 'string' && body.joined_at
      ? body.joined_at
      : new Date().toISOString().slice(0, 10)

  const supabase = supabaseAdmin()
  const { data, error } = await supabase
    .from('members')
    .insert({ name, joined_at })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
