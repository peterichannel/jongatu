import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const VALID_TYPES = ['normal', 'rest', 'dinner', 'social', 'event'] as const
type SessionType = (typeof VALID_TYPES)[number]

export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const quarter_id = typeof body.quarter_id === 'string' ? body.quarter_id : ''
  const session_number =
    typeof body.session_number === 'number' && Number.isFinite(body.session_number)
      ? Math.max(1, Math.floor(body.session_number))
      : 0
  const date = typeof body.date === 'string' ? body.date : ''
  const type: SessionType =
    typeof body.type === 'string' && (VALID_TYPES as readonly string[]).includes(body.type)
      ? (body.type as SessionType)
      : 'normal'
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null

  if (!quarter_id || !session_number || !date) {
    return NextResponse.json({ error: 'quarter_id, session_number, date required' }, { status: 400 })
  }

  const supabase = supabaseAdmin()
  const { data, error } = await supabase
    .from('sessions')
    .insert({ quarter_id, session_number, date, type, note })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
