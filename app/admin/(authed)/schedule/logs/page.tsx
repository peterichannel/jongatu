import Link from 'next/link'
import { ChevronLeft, History } from 'lucide-react'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { Quarter } from '@/lib/types'
import { LogsView } from './logs-view'

export const revalidate = 0
export const dynamic = 'force-dynamic'

type LogRow = {
  id: string
  presentation_id: string
  member_id: string | null
  action: 'reserve' | 'release' | 'transfer_in' | 'transfer_out' | 'company_update'
  previous_value: string | null
  new_value: string | null
  created_at: string
}

type SessionLite = { id: string; session_number: number; date: string; quarter_id: string }
type PresLite = { id: string; session_id: string; slot: number }
type MemberLite = { id: string; name: string }

export type EnrichedLog = {
  id: string
  action: LogRow['action']
  member_name: string
  session_number: number | null
  session_date: string | null
  slot: number | null
  previous_value: string | null
  new_value: string | null
  created_at: string
}

export default async function ScheduleLogsPage({
  searchParams
}: {
  searchParams: { quarter?: string }
}) {
  let envError: string | null = null
  let quarters: Quarter[] = []
  let target: Quarter | null = null
  let logs: EnrichedLog[] = []

  try {
    const supabase = supabaseAdmin()
    const { data: qs, error: qErr } = await supabase
      .from('quarters')
      .select('*')
      .order('start_date', { ascending: false })
    if (qErr) throw new Error(qErr.message)
    quarters = qs ?? []
    target =
      (searchParams.quarter && quarters.find(q => q.id === searchParams.quarter)) ||
      quarters.find(q => q.is_active) ||
      quarters[0] ||
      null

    if (target) {
      const { data: ses } = await supabase
        .from('sessions')
        .select('id, session_number, date, quarter_id')
        .eq('quarter_id', target.id)
      const sessions = (ses ?? []) as SessionLite[]
      const sessionIds = sessions.map(s => s.id)

      let presentations: PresLite[] = []
      if (sessionIds.length > 0) {
        const { data: ps } = await supabase
          .from('presentations')
          .select('id, session_id, slot')
          .in('session_id', sessionIds)
        presentations = (ps ?? []) as PresLite[]
      }

      const presIds = presentations.map(p => p.id)
      let logRows: LogRow[] = []
      if (presIds.length > 0) {
        const { data: lr } = await supabase
          .from('presentation_reservation_logs')
          .select('*')
          .in('presentation_id', presIds)
          .order('created_at', { ascending: false })
          .limit(200)
        logRows = (lr ?? []) as LogRow[]
      }

      const { data: mems } = await supabase.from('members').select('id, name')
      const memberMap = new Map<string, string>()
      for (const m of (mems ?? []) as MemberLite[]) memberMap.set(m.id, m.name)

      const presMap = new Map<string, PresLite>()
      for (const p of presentations) presMap.set(p.id, p)
      const sessionMap = new Map<string, SessionLite>()
      for (const s of sessions) sessionMap.set(s.id, s)

      logs = logRows.map(l => {
        const p = presMap.get(l.presentation_id)
        const s = p ? sessionMap.get(p.session_id) : undefined
        return {
          id: l.id,
          action: l.action,
          member_name: l.member_id ? memberMap.get(l.member_id) ?? '(이전 멤버)' : '-',
          session_number: s?.session_number ?? null,
          session_date: s?.date ?? null,
          slot: p?.slot ?? null,
          previous_value: l.previous_value,
          new_value: l.new_value,
          created_at: l.created_at
        }
      })
    }
  } catch (e) {
    envError = e instanceof Error ? e.message : '데이터 로드 실패'
  }

  return (
    <div>
      <Link
        href="/admin/schedule"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ChevronLeft className="h-4 w-4" /> 분기 일정
      </Link>
      <div className="mb-2 flex items-center gap-2">
        <History className="h-5 w-5 text-gray-700" />
        <h1 className="text-2xl font-bold">예약 이력</h1>
      </div>
      {target && (
        <p className="mb-6 text-sm text-gray-600">
          {target.name} {target.is_active ? '(활성)' : ''}
        </p>
      )}

      {envError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {envError}
        </div>
      ) : !target ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          분기가 없습니다.
        </div>
      ) : (
        <LogsView quarters={quarters} targetQuarter={target} logs={logs} />
      )}
    </div>
  )
}
