import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { Member, Quarter, Session, Presentation } from '@/lib/types'
import { ScheduleEditor } from './schedule-editor'

export const revalidate = 0

export default async function SchedulePage() {
  let envError: string | null = null
  let activeQuarter: Quarter | null = null
  let allQuarters: Quarter[] = []
  let sessions: Session[] = []
  let presentations: Presentation[] = []
  let members: Member[] = []

  try {
    const supabase = supabaseAdmin()
    const [qRes, mRes] = await Promise.all([
      supabase.from('quarters').select('*').order('start_date', { ascending: false }),
      supabase
        .from('members')
        .select('*')
        .eq('is_active', true)
        .order('name')
    ])
    if (qRes.error) throw new Error(qRes.error.message)
    if (mRes.error) throw new Error(mRes.error.message)

    allQuarters = qRes.data ?? []
    members = mRes.data ?? []
    activeQuarter = allQuarters.find(q => q.is_active) ?? allQuarters[0] ?? null

    if (activeQuarter) {
      const { data: sData, error: sErr } = await supabase
        .from('sessions')
        .select('*')
        .eq('quarter_id', activeQuarter.id)
        .order('session_number', { ascending: true })
      if (sErr) throw new Error(sErr.message)
      sessions = sData ?? []

      if (sessions.length > 0) {
        const sessionIds = sessions.map(s => s.id)
        const { data: pData, error: pErr } = await supabase
          .from('presentations')
          .select('*')
          .in('session_id', sessionIds)
          .order('slot', { ascending: true })
        if (pErr) throw new Error(pErr.message)
        presentations = pData ?? []
      }
    }
  } catch (e) {
    envError = e instanceof Error ? e.message : 'Supabase 연결 실패'
  }

  return (
    <div>
      <Link
        href="/admin"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ChevronLeft className="h-4 w-4" /> 관리자 홈
      </Link>
      <h1 className="mb-6 text-2xl font-bold">분기 일정</h1>

      {envError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {envError}
        </div>
      ) : (
        <ScheduleEditor
          activeQuarter={activeQuarter}
          allQuarters={allQuarters}
          sessions={sessions}
          presentations={presentations}
          members={members}
        />
      )}
    </div>
  )
}
