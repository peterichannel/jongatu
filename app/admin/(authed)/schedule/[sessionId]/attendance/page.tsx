import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { Member, Presentation, Session } from '@/lib/types'
import { AttendanceChecker } from './attendance-checker'

export const revalidate = 0

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

function formatDateKR(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  if (!y) return d
  const dt = new Date(Date.UTC(y, m - 1, day))
  return `${m}월 ${day}일 (${WEEKDAY[dt.getUTCDay()]})`
}

type AttendanceRow = {
  id: string
  session_id: string
  member_id: string
  status: 'present' | 'late' | 'absent' | 'excused'
  checked_in_at: string | null
  is_confirmed: boolean
}

type PreAttendanceRow = {
  session_id: string
  member_id: string
  status: 'attending' | 'absent'
  reason: string | null
}

export default async function SessionAttendancePage({
  params
}: {
  params: { sessionId: string }
}) {
  let session: Session | null = null
  let presentations: Presentation[] = []
  let members: Member[] = []
  let attendances: AttendanceRow[] = []
  let preAttendances: PreAttendanceRow[] = []
  let envError: string | null = null

  try {
    const supabase = supabaseAdmin()
    const { data: s, error: sErr } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', params.sessionId)
      .maybeSingle()
    if (sErr) throw new Error(sErr.message)
    session = s

    if (session) {
      const [pRes, mRes, aRes, paRes] = await Promise.all([
        supabase
          .from('presentations')
          .select('*')
          .eq('session_id', session.id)
          .order('slot'),
        supabase.from('members').select('*').eq('is_active', true).order('name'),
        supabase.from('attendances').select('*').eq('session_id', session.id),
        supabase.from('pre_attendances').select('*').eq('session_id', session.id)
      ])
      presentations = pRes.data ?? []
      members = mRes.data ?? []
      attendances = (aRes.data as AttendanceRow[]) ?? []
      preAttendances = (paRes.data as PreAttendanceRow[]) ?? []
    }
  } catch (e) {
    envError = e instanceof Error ? e.message : '데이터 로드 실패'
  }

  if (!envError && !session) notFound()

  return (
    <div>
      <Link
        href="/admin/schedule"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ChevronLeft className="h-4 w-4" /> 분기 일정
      </Link>

      {envError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {envError}
        </div>
      ) : session && session.type !== 'normal' ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          정상 회차가 아닙니다 (휴강/식사/친목 회차는 출석체크가 없습니다).
        </div>
      ) : (
        session && (
          <>
            <div className="mb-6">
              <div className="text-sm text-gray-500">{session.session_number}회차</div>
              <h1 className="text-2xl font-bold">{formatDateKR(session.date)} 출석체크</h1>
            </div>
            <AttendanceChecker
              session={session}
              presentations={presentations}
              members={members}
              initialAttendances={attendances}
              preAttendances={preAttendances}
            />
          </>
        )
      )}
    </div>
  )
}
