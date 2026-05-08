import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getAuthedAdmin } from '@/lib/member-auth'

export const runtime = 'nodejs'

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const admin = await getAuthedAdmin()
  if (!admin) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim()) update.name = body.name.trim()
  if (typeof body.is_active === 'boolean') update.is_active = body.is_active
  if (typeof body.is_admin === 'boolean') {
    if (params.id === admin.id && body.is_admin === false) {
      return NextResponse.json(
        { error: '본인의 운영자 권한은 직접 회수할 수 없습니다' },
        { status: 400 }
      )
    }
    update.is_admin = body.is_admin
  }
  if (typeof body.joined_at === 'string' && body.joined_at) update.joined_at = body.joined_at

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no valid fields' }, { status: 400 })
  }

  const supabase = supabaseAdmin()
  const { error } = await supabase.from('members').update(update).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = supabaseAdmin()
  const { error } = await supabase
    .from('members')
    .update({ is_active: false })
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
