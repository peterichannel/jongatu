import Link from 'next/link'
import {
  ArrowRight,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Clock,
  ShieldCheck,
  Users,
  XCircle
} from 'lucide-react'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getAuthedMember } from '@/lib/member-auth'
import { MemberAuthFlow } from '@/components/MemberAuthFlow'
import { CheckInButton } from './check-in-button'
import type { Member, Session } from '@/lib/types'

export const revalidate = 0

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']
function formatDateKR(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  if (!y) return d
  const dt = new Date(Date.UTC(y, m - 1, day))
  return `${m}월 ${day}일 (${WEEKDAY[dt.getUTCDay()]})`
}

function todayISOInSeoul() {
  const now = new Date()
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000
  const seoul = new Date(utcMs + 9 * 3600_000)
  const yyyy = seoul.getFullYear()
  const mm = String(seoul.getMonth() + 1).padStart(2, '0')
  const dd = String(seoul.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

type PreAttendanceRow = {
  id: string
  session_id: string
  member_id: string
  status: 'attending' | 'absent'
  reason: string | null
  responded_at: string
}

type AttendanceRow = {
  id: string
  session_id: string
  member_id: string
  status: 'present' | 'late' | 'absent' | 'excused'
  checked_in_at: string | null
  is_confirmed: boolean
}

export default async function HomePage() {
  let envErrorMessage: string | null = null
  let members: Member[] = []
  let nextSession: Session | null = null
  let todaySession: Session | null = null
  let myPreAttendance: PreAttendanceRow | null = null
  let myAttendanceToday: AttendanceRow | null = null
  let preCountsForNext: { attending: number; absent: number; no_response: number } | null = null
  let attCountsForToday: {
    present: number
    late: number
    absent: number
    excused: number
    unchecked: number
  } | null = null
  let activeMemberCount = 0

  try {
    const supabase = supabaseAdmin()
    const { data, error } = await supabase
      .from('members')
      .select('id, name, joined_at, is_active, created_at, pin_hash')
      .eq('is_active', true)
      .order('name')
    if (error) throw new Error(error.message)
    members = (data ?? []) as Member[]
    activeMemberCount = members.length

    const { data: q } = await supabase
      .from('quarters')
      .select('id')
      .eq('is_active', true)
      .maybeSingle()
    if (q) {
      const today = todayISOInSeoul()
      // 오늘 회차
      const { data: ts } = await supabase
        .from('sessions')
        .select('*')
        .eq('quarter_id', q.id)
        .eq('type', 'normal')
        .eq('date', today)
        .maybeSingle()
      todaySession = ts ?? null

      // 다음 회차 (오늘 포함 이후)
      const { data: ns } = await supabase
        .from('sessions')
        .select('*')
        .eq('quarter_id', q.id)
        .eq('type', 'normal')
        .gte('date', today)
        .order('date', { ascending: true })
        .limit(1)
        .maybeSingle()
      nextSession = ns
    }
  } catch (e) {
    envErrorMessage = e instanceof Error ? e.message : '데이터 로드 실패'
  }

  const me = envErrorMessage ? null : await getAuthedMember()

  if (me && !envErrorMessage) {
    try {
      const supabase = supabaseAdmin()

      if (nextSession) {
        const { data: pre } = await supabase
          .from('pre_attendances')
          .select('*')
          .eq('session_id', nextSession.id)
          .eq('member_id', me.id)
          .maybeSingle()
        myPreAttendance = pre ?? null

        if (me.is_admin) {
          const { data: allPre } = await supabase
            .from('pre_attendances')
            .select('member_id, status')
            .eq('session_id', nextSession.id)
          const respondedIds = new Set<string>()
          let attending = 0
          let absent = 0
          for (const p of allPre ?? []) {
            respondedIds.add(p.member_id as string)
            if (p.status === 'attending') attending += 1
            else absent += 1
          }
          const no_response = activeMemberCount - respondedIds.size
          preCountsForNext = { attending, absent, no_response: Math.max(no_response, 0) }
        }
      }

      if (todaySession) {
        const { data: att } = await supabase
          .from('attendances')
          .select('*')
          .eq('session_id', todaySession.id)
          .eq('member_id', me.id)
          .maybeSingle()
        myAttendanceToday = att ?? null

        if (me.is_admin) {
          const { data: allAtt } = await supabase
            .from('attendances')
            .select('member_id, status')
            .eq('session_id', todaySession.id)
          const counts = { present: 0, late: 0, absent: 0, excused: 0 }
          const checkedIds = new Set<string>()
          for (const a of allAtt ?? []) {
            const k = a.status as keyof typeof counts
            if (k in counts) counts[k] += 1
            checkedIds.add(a.member_id as string)
          }
          attCountsForToday = {
            ...counts,
            unchecked: Math.max(activeMemberCount - checkedIds.size, 0)
          }
        }
      }
    } catch {
      // 비치명적, 메인 화면은 보여줌
    }
  }

  return (
    <main className="flex-1 px-5 py-6">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">종로 가치 투자 스터디</h1>
      </header>

      {envErrorMessage ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-base font-semibold text-amber-900">설정 필요</p>
          <p className="mt-1 text-sm text-amber-800 break-all">{envErrorMessage}</p>
          {envErrorMessage.toLowerCase().includes('pin_hash') && (
            <p className="mt-3 rounded-lg bg-white p-3 text-xs text-gray-700">
              <strong>해결 방법:</strong> Supabase SQL Editor에서{' '}
              <code className="rounded bg-gray-100 px-1.5 py-0.5">
                supabase/migrations/0003_member_auth.sql
              </code>{' '}
              실행 후 페이지 새로고침
            </p>
          )}
        </div>
      ) : me ? (
        <SignedInView
          member={me}
          nextSession={nextSession}
          todaySession={todaySession}
          myPreAttendance={myPreAttendance}
          myAttendanceToday={myAttendanceToday}
          preCountsForNext={preCountsForNext}
          attCountsForToday={attCountsForToday}
          activeMemberCount={activeMemberCount}
        />
      ) : (
        <MemberAuthFlow members={members.map(m => ({ id: m.id, name: m.name }))} />
      )}
    </main>
  )
}

function SignedInView({
  member,
  nextSession,
  todaySession,
  myPreAttendance,
  myAttendanceToday,
  preCountsForNext,
  attCountsForToday,
  activeMemberCount
}: {
  member: Member
  nextSession: Session | null
  todaySession: Session | null
  myPreAttendance: PreAttendanceRow | null
  myAttendanceToday: AttendanceRow | null
  preCountsForNext: { attending: number; absent: number; no_response: number } | null
  attCountsForToday: {
    present: number
    late: number
    absent: number
    excused: number
    unchecked: number
  } | null
  activeMemberCount: number
}) {
  const isToday = !!todaySession
  return (
    <>
      <section className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-5">
        <div className="flex items-center gap-2 text-xs font-bold text-green-700">
          반갑습니다
          {member.is_admin && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-green-700 px-2 py-0.5 text-[10px] text-white">
              <ShieldCheck className="h-2.5 w-2.5" />
              운영자
            </span>
          )}
        </div>
        <div className="mt-1 text-2xl font-bold text-green-900">{member.name}님</div>
      </section>

      {member.is_admin && (
        <section className="mb-5">
          <Link
            href="/admin"
            className="flex items-center justify-between rounded-2xl border border-gray-900 bg-gray-900 p-4 text-white hover:bg-gray-800"
          >
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-6 w-6" />
              <div>
                <div className="text-base font-bold">관리자 메뉴</div>
                <div className="text-xs text-gray-300">멤버/일정/평가/정산 관리</div>
              </div>
            </div>
            <ArrowRight className="h-5 w-5" />
          </Link>
        </section>
      )}

      {/* 오늘 출석 체크인 (당일에만 노출) */}
      {isToday && todaySession && (
        <section className="mb-5 rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
          <div className="flex items-center gap-2 text-sm font-bold text-amber-900">
            <CalendarCheck className="h-5 w-5" />
            오늘 스터디 — {formatDateKR(todaySession.date)} · {todaySession.session_number}회차
          </div>
          {myAttendanceToday ? (
            <CheckedInStatus row={myAttendanceToday} />
          ) : (
            <div className="mt-3">
              <CheckInButton sessionId={todaySession.id} />
              <p className="mt-2 text-xs text-amber-800">
                도착하시면 위 버튼을 눌러주세요. 19시 20분 이후 = 지각.
              </p>
            </div>
          )}
        </section>
      )}

      {/* 다음 스터디 + 사전참석 응답 */}
      <section className="mb-5 rounded-2xl bg-green-50 p-5">
        <h2 className="mb-2 text-lg font-bold text-green-900">📅 다음 스터디</h2>
        {nextSession ? (
          <>
            <p className="text-base text-green-800">
              {formatDateKR(nextSession.date)} · {nextSession.session_number}회차
            </p>
            <div className="mt-3">
              {myPreAttendance ? (
                <PreAttendanceStatus row={myPreAttendance} />
              ) : (
                <Link
                  href="/attendance"
                  className="inline-block rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700"
                >
                  사전참석 응답하기
                </Link>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="text-base text-green-800">분기 일정이 등록되면 여기에 표시됩니다.</p>
            <p className="mt-2 text-sm text-green-700">
              운영자가 일정을 등록할 때까지 잠시만 기다려주세요.
            </p>
          </>
        )}
      </section>

      {/* 운영자 서머리: 사전참석 + 오늘 출석 */}
      {member.is_admin && (
        <>
          {preCountsForNext && nextSession && (
            <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
                  <ClipboardList className="h-4 w-4" />
                  사전참석 현황 — {nextSession.session_number}회차
                </div>
                <span className="text-xs text-gray-500">
                  활성 {activeMemberCount}명
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <SummaryStat
                  label="참석"
                  value={preCountsForNext.attending}
                  color="text-green-700"
                />
                <SummaryStat
                  label="불참"
                  value={preCountsForNext.absent}
                  color="text-red-700"
                />
                <SummaryStat
                  label="미응답"
                  value={preCountsForNext.no_response}
                  color="text-amber-700"
                />
              </div>
            </section>
          )}

          {attCountsForToday && todaySession && (
            <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
                  <Users className="h-4 w-4" />
                  오늘 출석 현황 — {todaySession.session_number}회차
                </div>
                <Link
                  href={`/admin/schedule/${todaySession.id}/attendance`}
                  className="text-xs font-semibold text-blue-700 hover:underline"
                >
                  상세 →
                </Link>
              </div>
              <div className="grid grid-cols-5 gap-2 text-center">
                <SummaryStat label="출석" value={attCountsForToday.present} color="text-green-700" />
                <SummaryStat label="지각" value={attCountsForToday.late} color="text-amber-700" />
                <SummaryStat label="결석" value={attCountsForToday.absent} color="text-red-700" />
                <SummaryStat label="공결" value={attCountsForToday.excused} color="text-gray-700" />
                <SummaryStat
                  label="미체크"
                  value={attCountsForToday.unchecked}
                  color="text-gray-400"
                />
              </div>
            </section>
          )}
        </>
      )}
    </>
  )
}

function PreAttendanceStatus({ row }: { row: PreAttendanceRow }) {
  return (
    <div className="rounded-xl bg-white p-3">
      <div className="flex items-center gap-2">
        {row.status === 'attending' ? (
          <>
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <span className="text-base font-bold text-green-900">사전참석 응답: 참석</span>
          </>
        ) : (
          <>
            <XCircle className="h-5 w-5 text-red-600" />
            <span className="text-base font-bold text-red-900">사전참석 응답: 불참</span>
          </>
        )}
      </div>
      {row.status === 'absent' && row.reason && (
        <div className="mt-1 text-sm text-gray-700">사유: {row.reason}</div>
      )}
      <Link
        href="/attendance"
        className="mt-2 inline-block text-xs font-semibold text-green-700 hover:underline"
      >
        응답 변경하기 →
      </Link>
    </div>
  )
}

function CheckedInStatus({ row }: { row: AttendanceRow }) {
  const time = row.checked_in_at
    ? new Date(row.checked_in_at).toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Seoul'
      })
    : '-'
  if (row.status === 'late') {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-white p-3">
        <Clock className="h-5 w-5 text-amber-600" />
        <span className="text-base font-bold text-amber-900">{time} 체크 — 지각</span>
      </div>
    )
  }
  if (row.status === 'present') {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-white p-3">
        <CheckCircle2 className="h-5 w-5 text-green-600" />
        <span className="text-base font-bold text-green-900">{time} 체크 — 출석</span>
      </div>
    )
  }
  if (row.status === 'absent') {
    return (
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-white p-3">
        <XCircle className="h-5 w-5 text-red-600" />
        <span className="text-base font-bold text-red-900">결석 처리</span>
      </div>
    )
  }
  return (
    <div className="mt-3 rounded-xl bg-white p-3 text-sm text-gray-700">공결 처리</div>
  )
}

function SummaryStat({
  label,
  value,
  color
}: {
  label: string
  value: number
  color: string
}) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  )
}
