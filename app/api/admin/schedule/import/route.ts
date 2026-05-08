import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/server'

export const runtime = 'nodejs'

const VALID_TYPES = new Set(['normal', 'rest', 'dinner', 'social', 'event'])

type ImportRow = {
  session_number: number
  date: string
  type: 'normal' | 'rest' | 'dinner' | 'social' | 'event'
  note: string | null
  slot: number | null
  presenter_names: string[]
  company_name: string | null
  cafe_url: string | null
}

type ImportError = { row: number; message: string }
type ImportResult = {
  created_sessions: number
  reused_sessions: number
  created_presentations: number
  skipped_presentations: number
  unmatched_names: string[]
  errors: ImportError[]
}

function isValidRow(r: unknown): r is ImportRow {
  if (!r || typeof r !== 'object') return false
  const row = r as Record<string, unknown>
  if (typeof row.session_number !== 'number') return false
  if (typeof row.date !== 'string' || !row.date) return false
  if (typeof row.type !== 'string' || !VALID_TYPES.has(row.type)) return false
  if (!Array.isArray(row.presenter_names)) return false
  return true
}

export async function POST(req: Request) {
  let body: { quarter_id?: unknown; rows?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 })
  }

  const quarter_id = typeof body.quarter_id === 'string' ? body.quarter_id : ''
  if (!quarter_id) return NextResponse.json({ error: 'quarter_id required' }, { status: 400 })

  const rawRows = Array.isArray(body.rows) ? body.rows : []
  if (rawRows.length === 0) return NextResponse.json({ error: 'rows empty' }, { status: 400 })

  const supabase = supabaseAdmin()

  const { data: quarterCheck, error: qErr } = await supabase
    .from('quarters')
    .select('id')
    .eq('id', quarter_id)
    .maybeSingle()
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 500 })
  if (!quarterCheck) return NextResponse.json({ error: 'quarter not found' }, { status: 404 })

  const { data: members, error: mErr } = await supabase
    .from('members')
    .select('id, name')
    .eq('is_active', true)
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })
  const nameToId = new Map<string, string>()
  for (const m of members ?? []) nameToId.set(m.name, m.id)

  const { data: existingSessions, error: esErr } = await supabase
    .from('sessions')
    .select('id, session_number')
    .eq('quarter_id', quarter_id)
  if (esErr) return NextResponse.json({ error: esErr.message }, { status: 500 })
  const sessionNumToId = new Map<number, string>()
  for (const s of existingSessions ?? []) sessionNumToId.set(s.session_number, s.id)

  const result: ImportResult = {
    created_sessions: 0,
    reused_sessions: 0,
    created_presentations: 0,
    skipped_presentations: 0,
    unmatched_names: [],
    errors: []
  }
  const unmatchedSet = new Set<string>()

  const rowsBySession = new Map<number, { meta: ImportRow; presentations: ImportRow[] }>()
  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i]
    if (!isValidRow(raw)) {
      result.errors.push({ row: i + 1, message: '필수 필드 누락 또는 잘못된 형식' })
      continue
    }
    const r = raw
    const existing = rowsBySession.get(r.session_number)
    if (!existing) {
      rowsBySession.set(r.session_number, { meta: r, presentations: [] })
    }
    if (r.slot !== null && r.slot !== undefined && r.presenter_names.length > 0) {
      rowsBySession.get(r.session_number)!.presentations.push(r)
    }
  }

  for (const [sessionNum, group] of Array.from(rowsBySession.entries())) {
    let sessionId: string | undefined = sessionNumToId.get(sessionNum)
    if (sessionId) {
      result.reused_sessions += 1
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from('sessions')
        .insert({
          quarter_id,
          session_number: sessionNum,
          date: group.meta.date,
          type: group.meta.type,
          note: group.meta.note || null
        })
        .select('id')
        .single()
      if (insErr || !inserted) {
        result.errors.push({
          row: 0,
          message: `${sessionNum}회차 등록 실패: ${insErr?.message ?? 'unknown'}`
        })
        continue
      }
      sessionId = inserted.id as string
      sessionNumToId.set(sessionNum, sessionId)
      result.created_sessions += 1
    }
    if (!sessionId) continue

    const { data: existingPresentations } = await supabase
      .from('presentations')
      .select('slot')
      .eq('session_id', sessionId)
    const usedSlots = new Set((existingPresentations ?? []).map(p => p.slot))

    for (const p of group.presentations) {
      const slotNum = p.slot ?? 0
      if (!slotNum) {
        result.errors.push({ row: 0, message: `${sessionNum}회차 발표 슬롯 번호 누락` })
        continue
      }
      if (usedSlots.has(slotNum)) {
        result.skipped_presentations += 1
        continue
      }
      let presenter_id: string | null = null
      for (const name of p.presenter_names) {
        const id = nameToId.get(name)
        if (id) {
          presenter_id = id
          break
        } else {
          unmatchedSet.add(name)
        }
      }
      if (!presenter_id) {
        result.errors.push({
          row: 0,
          message: `${sessionNum}회차 ${slotNum}번 발표: 발표자 매칭 실패`
        })
        continue
      }
      const { error: pErr } = await supabase.from('presentations').insert({
        session_id: sessionId,
        slot: slotNum,
        presenter_id,
        company_name: p.company_name || null,
        cafe_url: p.cafe_url || null,
        reserved_at: new Date().toISOString()
      })
      if (pErr) {
        result.errors.push({
          row: 0,
          message: `${sessionNum}회차 ${slotNum}번 발표 실패: ${pErr.message}`
        })
        continue
      }
      usedSlots.add(slotNum)
      result.created_presentations += 1
    }
  }

  result.unmatched_names = Array.from(unmatchedSet)
  return NextResponse.json(result)
}
