import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getAuthedMember } from '@/lib/member-auth'
import { addDaysSeoulISO, seoulDateISO } from '@/lib/seoul-time'
import type { Member, Presentation, Session } from '@/lib/types'
import { AttendanceResponse } from './attendance-response'

export const revalidate = 0

// 사전참석 응답 창: 회차 D-3부터 (그 이전엔 인지 부담만 크고 답변 신뢰도가 낮음)
const PRE_ATTEND_WINDOW_DAYS = 3

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
  id: string
  session_id: string
  member_id: string
  status: 'attending' | 'absent'
  reason: string | null
  responded_at: string
}

export default async function AttendancePage() {
  let me: Member | null = null
  let envError: string | null = null
  let todaySession: Session | null = null
  let futureSession: Session | null = null
  let deferredSession: Session | null = null
  let todayPresentations: Presentation[] = []
  let futurePresentations: Presentation[] = []
  let myAttendanceToday: AttendanceRow | null = null
  let myPreToday: PreAttendanceRow | null = null
  let myPreFuture: PreAttendanceRow | null = null
  let members: Member[] = []

  try {
    const supabase = supabaseAdmin()

    // ── 1파: 인증 + 활성 분기 + 명단 (서로 독립)
    const [meRes, quarterRes, membersRes] = await Promise.all([
      getAuthedMember(),
      supabase.from('quarters').select('id').eq('is_active', true).maybeSingle(),
      supabase.from('members').select('*').eq('is_active', true).order('name')
    ])
    me = meRes
    members = membersRes.data ?? []
    const q = quarterRes.data

    if (me && q) {
      const today = seoulDateISO()
      const sessionsOf = () => {
        const base = supabase
          .from('sessions')
          .select('*')
          .eq('quarter_id', q.id)
          .eq('type', 'normal')
        return me!.is_admin ? base : base.eq('is_test', false)
      }

      // ── 2파: 오늘 회차 + 미래 회차 (오늘 이후 가장 가까운 1건)
      const [todayRes, futureRes] = await Promise.all([
        sessionsOf().eq('date', today).maybeSingle(),
        sessionsOf().gt('date', today).order('date', { ascending: true }).limit(1).maybeSingle()
      ])
      todaySession = (todayRes.data as Session | null) ?? null

      // 사전참석 카드는 한 시점에 최대 하나만 노출한다.
      // - 오늘 회차가 있으면 → 오늘 것에 집중, 다음 회차는 숨김
      // - 오늘 회차가 없으면 → 다음 회차가 D-3 이내일 때만 노출
      const futureRaw = (futureRes.data as Session | null) ?? null
      const inPreWindow =
        !!futureRaw &&
        !todaySession &&
        futureRaw.date <= addDaysSeoulISO(today, PRE_ATTEND_WINDOW_DAYS)
      futureSession = inPreWindow ? futureRaw : null
      // 아직 응답 창이 열리지 않은 회차 (안내 문구용)
      if (!todaySession && !inPreWindow) deferredSession = futureRaw

      const sessionIds: string[] = []
      if (todaySession) sessionIds.push(todaySession.id)
      if (futureSession) sessionIds.push(futureSession.id)

      if (sessionIds.length > 0) {
        const [presRes, attRes, preRes] = await Promise.all([
          supabase.from('presentations').select('*').in('session_id', sessionIds).order('slot'),
          todaySession
            ? supabase
                .from('attendances')
                .select('*')
                .eq('session_id', todaySession.id)
                .eq('member_id', me.id)
                .maybeSingle()
            : Promise.resolve({ data: null, error: null }),
          supabase
            .from('pre_attendances')
            .select('*')
            .eq('member_id', me.id)
            .in('session_id', sessionIds)
        ])

        const allPres = (presRes.data ?? []) as Presentation[]
        if (todaySession)
          todayPresentations = allPres.filter(p => p.session_id === todaySession!.id)
        if (futureSession)
          futurePresentations = allPres.filter(p => p.session_id === futureSession!.id)

        myAttendanceToday = (attRes.data as AttendanceRow | null) ?? null
        for (const row of (preRes.data as PreAttendanceRow[] | null) ?? []) {
          if (todaySession && row.session_id === todaySession.id) myPreToday = row
          if (futureSession && row.session_id === futureSession.id) myPreFuture = row
        }
      }
    }
  } catch (e) {
    envError = e instanceof Error ? e.message : '데이터 로드 실패'
  }

  if (!me) {
    return (
      <main className="flex-1 px-5 py-6">
        <h1 className="mb-6 text-2xl font-bold">출결</h1>
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-base font-semibold text-amber-900">로그인이 필요합니다</p>
            <p className="mt-1 text-sm text-amber-800">
              홈에서 본인 이름을 선택하고 PIN을 입력하시면 출결 응답이 가능합니다.
            </p>
          </div>
          <Link href="/">
            <Button className="w-full">홈으로</Button>
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="flex-1 px-5 py-6">
      <h1 className="mb-6 text-2xl font-bold">출결</h1>

      {envError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {envError}
        </div>
      ) : !todaySession && !futureSession ? (
        deferredSession ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-base font-semibold text-gray-900">
              지금은 응답할 회차가 없습니다
            </p>
            <p className="mt-1 text-sm text-gray-600">
              다음 회차는 {formatDateKR(deferredSession.date)} ·{' '}
              {deferredSession.session_number}회차입니다. 사전참석 응답은{' '}
              <b>
                {formatDateKR(addDaysSeoulISO(deferredSession.date, -PRE_ATTEND_WINDOW_DAYS))}
              </b>
              부터 가능합니다.
            </p>
            <Link href="/schedule" className="mt-4 block">
              <Button variant="outline" className="w-full">
                일정 보기
              </Button>
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-base font-semibold text-amber-900">다가오는 회차가 없습니다</p>
            <p className="mt-1 text-sm text-amber-800">
              운영자가 분기 일정을 등록할 때까지 기다려주세요.
            </p>
          </div>
        )
      ) : (
        <AttendanceResponse
          me={me}
          members={members}
          todaySession={todaySession}
          todayPresentations={todayPresentations}
          myAttendanceToday={myAttendanceToday}
          myPreToday={myPreToday}
          futureSession={futureSession}
          futurePresentations={futurePresentations}
          myPreFuture={myPreFuture}
        />
      )}
    </main>
  )
}
