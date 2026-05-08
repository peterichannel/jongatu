import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const runtime = 'nodejs'

export async function POST(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const supabase = supabaseAdmin()
  const { error } = await supabase
    .from('members')
    .update({ pin_hash: null })
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
