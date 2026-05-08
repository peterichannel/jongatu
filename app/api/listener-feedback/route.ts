import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getAuthedMember } from '@/lib/member-auth'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  const me = await getAuthedMember()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const session_id = url.searchParams.get('session_id') || ''
  if (!session_id) {
    return NextResponse.json({ error: 'session_id required' }, { status: 400 })
  }
  const supabase = supabaseAdmin()
  const { data, error } = await supabase
    .from('listener_feedbacks')
    .select('*')
    .eq('session_id', session_id)
    .eq('evaluator_id', me.id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ feedback: data })
}

export async function POST(req: Request) {
  const me = await getAuthedMember()
  if (!me) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const session_id = typeof body.session_id === 'string' ? body.session_id : ''
  const content = typeof body.content === 'string' ? body.content.trim() : ''

  if (!session_id || !content) {
    return NextResponse.json({ error: 'invalid input' }, { status: 400 })
  }

  const supabase = supabaseAdmin()
  const { error } = await supabase
    .from('listener_feedbacks')
    .upsert(
      { session_id, evaluator_id: me.id, content },
      { onConflict: 'session_id,evaluator_id' }
    )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
