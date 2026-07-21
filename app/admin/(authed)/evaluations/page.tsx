import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { Member, Presentation, Session } from '@/lib/types'
import { EvaluationResults } from './evaluation-results'

export const revalidate = 0

type Evaluation = {
  id: string
  session_id: string
  evaluator_id: string
  presentation_id: string
  preparation: number
  delivery: number
  qna: number
  time_management: number
  attractiveness: number
  feedback: string
}

type ListenerFeedback = {
  id: string
  session_id: string
  evaluator_id: string
  content: string
  created_at: string
}

type AttendanceRow = {
  session_id: string
  member_id: string
  status: 'present' | 'late' | 'absent' | 'excused'
}

export default async function AdminEvaluationsPage() {
  let envError: string | null = null
  let sessions: Session[] = []
  let presentations: Presentation[] = []
  let evaluations: Evaluation[] = []
  let listenerFeedbacks: ListenerFeedback[] = []
  let attendances: AttendanceRow[] = []
  let members: Member[] = []
  let quarterName = ''

  try {
    const supabase = supabaseAdmin()

    // ── 1파: 활성 분기 + 명단 (서로 독립)
    const [quarterRes, membersRes] = await Promise.all([
      supabase.from('quarters').select('*').eq('is_active', true).maybeSingle(),
      supabase.from('members').select('*').order('name')
    ])
    if (quarterRes.error) throw new Error(quarterRes.error.message)
    members = membersRes.data ?? []
    const q = quarterRes.data

    if (q) {
      quarterName = q.name
      const { data: ses, error: sErr } = await supabase
        .from('sessions')
        .select('*')
        .eq('quarter_id', q.id)
        .eq('type', 'normal')
        .order('session_number', { ascending: true })
      if (sErr) throw new Error(sErr.message)
      sessions = ses ?? []

      if (sessions.length > 0) {
        const sessionIds = sessions.map(s => s.id)
        const [pRes, eRes, lRes, aRes] = await Promise.all([
          supabase
            .from('presentations')
            .select('*')
            .in('session_id', sessionIds)
            .order('slot'),
          supabase.from('evaluations').select('*').in('session_id', sessionIds),
          supabase.from('listener_feedbacks').select('*').in('session_id', sessionIds),
          supabase
            .from('attendances')
            .select('session_id, member_id, status')
            .in('session_id', sessionIds)
        ])
        presentations = pRes.data ?? []
        evaluations = (eRes.data as Evaluation[]) ?? []
        listenerFeedbacks = (lRes.data as ListenerFeedback[]) ?? []
        attendances = (aRes.data as AttendanceRow[]) ?? []
      }
    }
  } catch (e) {
    envError = e instanceof Error ? e.message : '데이터 로드 실패'
  }

  return (
    <div>
      <Link
        href="/admin"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ChevronLeft className="h-4 w-4" /> 관리자 홈
      </Link>
      <h1 className="mb-2 text-2xl font-bold">평가 결과</h1>
      {quarterName && <p className="mb-6 text-sm text-gray-600">{quarterName} 분기</p>}

      {envError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {envError}
        </div>
      ) : sessions.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          활성 분기에 등록된 회차가 없습니다.
        </div>
      ) : (
        <EvaluationResults
          sessions={sessions}
          presentations={presentations}
          evaluations={evaluations}
          listenerFeedbacks={listenerFeedbacks}
          attendances={attendances}
          members={members}
        />
      )}
    </div>
  )
}
