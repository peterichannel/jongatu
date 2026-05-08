import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = supabaseAdmin()
  const { data, error } = await supabase.rpc('confirm_session_attendance', {
    p_session_id: params.id
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, ...((data as object) ?? {}) })
}
