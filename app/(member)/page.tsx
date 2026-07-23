import Link from 'next/link'
import { ArrowRight, ChevronRight, ShieldCheck } from 'lucide-react'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getAuthedMember } from '@/lib/member-auth'
import {
  PRE_ATTENDANCE_CUTOFF_MINUTES,
  canEvaluateAttendance,
  formatMinutesKR,
  seoulDateISO,
  seoulMinutesOfDay
} from '@/lib/seoul-time'
import { formatKRW } from '@/lib/utils'
import { MemberAuthFlow } from '@/components/MemberAuthFlow'
import { CopyShareButtons } from '@/components/CopyShareButtons'
import type { Member, Presentation, Session } from '@/lib/types'

const APP_URL = process.env.NEXT_PUBLIC_SITE_URL ?? ''

export const revalidate = 0

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']
function formatDateKR(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  if (!y) return d
  const dt = new Date(Date.UTC(y, m - 1, day))
  return `${m}월 ${day}일 (${WEEKDAY[dt.getUTCDay()]})`
}

// 출석 체크 윈도우 (당일 18:30 ~ 20:00)
const ATTEND_WINDOW_START = 18 * 60 + 30
const ATTEND_WINDOW_END = 20 * 60

// 운영자 출석 안내 윈도우 (당일 18:00 ~ 18:30)
const NOTICE_WINDOW_START = 18 * 60
const NOTICE_WINDOW_END = 18 * 60 + 30

// KST 기준 두 날짜(YYYY-MM-DD) 사이 일수: target - today
function daysFromTodayKST(today: string, target: string): number {
  const t1 = new Date(`${today}T00:00:00+09:00`).getTime()
  const t2 = new Date(`${target}T00:00:00+09:00`).getTime()
  return Math.round((t2 - t1) / (24 * 3600_000))
}

export default async function HomePage() {
  let envErrorMessage: string | null = null
  let members: Member[] = []
  let nextSession: Session | null = null
  let nextPresentations: Presentation[] = []
  let todaySession: Session | null = null
  let evalSession: Session | null = null
  let myPreAttended = false
  let myAttendanceToday = false
  let evalUnfinishedCount = 0
  let myEvalAttendable = false
  let unresponded: { id: string; name: string }[] = []
  let myBalance: number | null = null
  let myAttendanceRate: number | null = null
  let me: Member | null = null

  try {
    const supabase = supabaseAdmin()
    const today = seoulDateISO()
    const NONE = Promise.resolve({ data: null })

    // ── 1파: 서로 독립인 조회 4건 (인증 / 명단 / 활성 분기 / 활성 반기)
    const [meRes, membersRes, quarterRes, halfRes] = await Promise.all([
      getAuthedMember(),
      supabase
        .from('members')
        .select('id, name, joined_at, is_active, is_admin, created_at, pin_hash')
        .eq('is_active', true)
        .order('name'),
      supabase.from('quarters').select('id').eq('is_active', true).maybeSingle(),
      supabase.from('halves').select('id').eq('is_active', true).maybeSingle()
    ])
    if (membersRes.error) throw new Error(membersRes.error.message)
    me = meRes
    members = (membersRes.data ?? []) as Member[]
    const q = quarterRes.data
    const activeHalf = halfRes.data

    if (q) {
      // 비운영진은 is_test 회차 숨김
      const isAdmin = !!me?.is_admin
      const sessionsOf = () => {
        const base = supabase
          .from('sessions')
          .select('*')
          .eq('quarter_id', q.id)
          .eq('type', 'normal')
        return isAdmin ? base : base.eq('is_test', false)
      }

      // ── 2파: 활성 분기/반기에만 의존하는 조회 5건
      const [nextRes, todayRes, evalRes, qSessionsRes, depositRes] = await Promise.all([
        // 다음 회차 (오늘 포함 이후)
        sessionsOf().gte('date', today).order('date', { ascending: true }).limit(1).maybeSingle(),
        // 오늘 회차 (출석 체크 카드용)
        sessionsOf().eq('date', today).maybeSingle(),
        // 평가 대상 회차: 어제 이전 normal 중 가장 최근
        me
          ? sessionsOf().lt('date', today).order('date', { ascending: false }).limit(1).maybeSingle()
          : NONE,
        // 출석률 계산용 분기 전체 회차
        me ? supabase.from('sessions').select('id, type, is_test').eq('quarter_id', q.id) : NONE,
        // 보증금 잔액 (활성 반기 기준)
        me && activeHalf
          ? supabase
              .from('deposits')
              .select('current_balance')
              .eq('member_id', me.id)
              .eq('half_id', activeHalf.id)
              .maybeSingle()
          : NONE
      ])

      nextSession = (nextRes.data as Session | null) ?? null
      todaySession = (todayRes.data as Session | null) ?? null
      evalSession = (evalRes.data as Session | null) ?? null
      const deposit = depositRes.data as { current_balance: number } | null
      if (deposit) myBalance = deposit.current_balance

      const normalIds = ((qSessionsRes.data ?? []) as {
        id: string
        type: string
        is_test: boolean
      }[])
        .filter(s => s.type === 'normal' && !s.is_test)
        .map(s => s.id)

      // ── 3파: 위에서 찾은 회차들에 의존하는 조회 8건
      const [presRes, myPreRes, myAttRes, targetsRes, myEvalRes, allPreRes, attsRes, evalAttRes] =
        await Promise.all([
          nextSession
            ? supabase
                .from('presentations')
                .select('*')
                .eq('session_id', nextSession.id)
                .order('slot')
            : NONE,
          me && nextSession
            ? supabase
                .from('pre_attendances')
                .select('id')
                .eq('session_id', nextSession.id)
                .eq('member_id', me.id)
                .maybeSingle()
            : NONE,
          me && todaySession
            ? supabase
                .from('attendances')
                .select('id')
                .eq('session_id', todaySession.id)
                .eq('member_id', me.id)
                .maybeSingle()
            : NONE,
          me && evalSession
            ? supabase
                .from('presentations')
                .select('presenter_id, special_label')
                .eq('session_id', evalSession.id)
            : NONE,
          me && evalSession
            ? supabase
                .from('evaluations')
                .select('*', { count: 'exact', head: true })
                .eq('session_id', evalSession.id)
                .eq('evaluator_id', me.id)
            : Promise.resolve({ count: 0 as number | null }),
          // 운영자: 다음 회차 사전참석 미응답자 명단 (재안내 카드용)
          me?.is_admin && nextSession
            ? supabase
                .from('pre_attendances')
                .select('member_id')
                .eq('session_id', nextSession.id)
            : NONE,
          me && normalIds.length > 0
            ? supabase
                .from('attendances')
                .select('status')
                .eq('member_id', me.id)
                .in('session_id', normalIds)
            : NONE,
          // 평가 대상 회차의 내 출석 상태 (출석/지각만 평가 카드 노출)
          me && evalSession
            ? supabase
                .from('attendances')
                .select('status')
                .eq('session_id', evalSession.id)
                .eq('member_id', me.id)
                .maybeSingle()
            : NONE
        ])

      nextPresentations = (presRes.data ?? []) as Presentation[]
      myPreAttended = !!myPreRes.data
      myAttendanceToday = !!myAttRes.data
      myEvalAttendable = canEvaluateAttendance(
        (evalAttRes.data as { status: string } | null)?.status
      )

      if (me && evalSession) {
        const targetCount = ((targetsRes.data ?? []) as {
          presenter_id: string | null
          special_label: string | null
        }[]).filter(p => p.presenter_id && p.presenter_id !== me!.id && !p.special_label).length
        evalUnfinishedCount = Math.max(targetCount - (myEvalRes.count ?? 0), 0)
      }

      if (me?.is_admin && nextSession) {
        const respondedIds = new Set(
          ((allPreRes.data ?? []) as { member_id: string }[]).map(p => p.member_id)
        )
        unresponded = members
          .filter(m => !respondedIds.has(m.id))
          .map(m => ({ id: m.id, name: m.name }))
      }

      if (me && normalIds.length > 0) {
        const atts = (attsRes.data ?? []) as { status: string }[]
        const total = atts.length
        const attended = atts.filter(a => a.status === 'present' || a.status === 'late').length
        myAttendanceRate = total > 0 ? Math.round((attended / total) * 1000) / 10 : null
      }
    }
  } catch (e) {
    envErrorMessage = e instanceof Error ? e.message : '데이터 로드 실패'
  }

  return (
    <main className="flex-1 px-5 py-6">
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
          nextPresentations={nextPresentations}
          allMembers={members}
          todaySession={todaySession}
          evalSession={evalSession}
          myPreAttended={myPreAttended}
          myAttendanceToday={myAttendanceToday}
          evalUnfinishedCount={evalUnfinishedCount}
          myEvalAttendable={myEvalAttendable}
          unresponded={unresponded}
          myBalance={myBalance}
          myAttendanceRate={myAttendanceRate}
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
  nextPresentations,
  allMembers,
  todaySession,
  evalSession,
  myPreAttended,
  myAttendanceToday,
  evalUnfinishedCount,
  myEvalAttendable,
  unresponded,
  myBalance,
  myAttendanceRate
}: {
  member: Member
  nextSession: Session | null
  nextPresentations: Presentation[]
  allMembers: Member[]
  todaySession: Session | null
  evalSession: Session | null
  myPreAttended: boolean
  myAttendanceToday: boolean
  evalUnfinishedCount: number
  myEvalAttendable: boolean
  unresponded: { id: string; name: string }[]
  myBalance: number | null
  myAttendanceRate: number | null
}) {
  const today = seoulDateISO()
  const nowMinutes = seoulMinutesOfDay()

  // 사전참석 답하기 카드 노출: D-2 ~ D-1 (오늘 + 1~2일이 회차일) AND 미응답
  const daysToNext = nextSession ? daysFromTodayKST(today, nextSession.date) : null
  const showPreAttendCard =
    !!nextSession && !myPreAttended && daysToNext !== null && (daysToNext === 1 || daysToNext === 2)

  // 출석 체크 카드 노출: 당일 18:30~20:00 + 미체크
  const showCheckInCard =
    !!todaySession &&
    !myAttendanceToday &&
    nowMinutes >= ATTEND_WINDOW_START &&
    nowMinutes < ATTEND_WINDOW_END

  // 평가 카드 노출: 평가 대상 회차 있고, 본인이 출석/지각했고, 미완료 발표 있고, 다음 회차 D-2 전
  const showEvalCard =
    !!evalSession &&
    myEvalAttendable &&
    evalUnfinishedCount > 0 &&
    (daysToNext === null || daysToNext >= 2)

  const hasAnyAction = showPreAttendCard || showCheckInCard || showEvalCard

  const memberName = (id: string | null | undefined) =>
    id ? allMembers.find(m => m.id === id)?.name ?? '(알수없음)' : ''

  const presentationLines = nextPresentations
    .filter(p => p.presenter_id || p.special_label)
    .map(p => ({
      id: p.id,
      slot: p.slot,
      label: p.special_label
        ? `🎉 ${p.special_label}`
        : `${memberName(p.presenter_id)}${p.company_name ? ' — ' + p.company_name : ''}`
    }))

  return (
    <>
      {/* 인사말 + 다음 스터디 정보 */}
      <section className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-5">
        <div className="flex items-center gap-2 text-xs font-bold text-green-700">
          안녕하세요
          {member.is_admin && <AdminBadge />}
        </div>
        <div className="mt-1 text-2xl font-bold text-green-900">{member.name}님</div>

        {nextSession ? (
          <div className="mt-4 border-t border-green-200 pt-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-green-700">
              📅 다음 스터디
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold text-green-900">
                {formatDateKR(nextSession.date)} · {nextSession.session_number}회차
              </span>
              {nextSession.is_test && <TestBadge />}
            </div>
            {presentationLines.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-green-900">
                {presentationLines.map(p => (
                  <li key={p.id}>
                    <span className="font-semibold">{p.slot}.</span> {p.label}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-green-700">
            분기 일정이 등록되면 여기에 표시됩니다.
          </p>
        )}
      </section>

      {/* 지금 해야 할 일 — 시간 기반 액션 카드 (조건 안 맞으면 카드 숨김) */}
      {hasAnyAction && (
        <section className="mb-5">
          <h2 className="mb-2 text-xs font-bold text-gray-700">⚡ 지금 해야 할 일</h2>
          <div className="space-y-2">
            {showPreAttendCard && nextSession && (
              <ActionCard
                href="/attendance"
                emoji="✓"
                title="사전참석 답하기"
                subtitle={`${formatDateKR(nextSession.date)} 회차 — D-${daysToNext}`}
                tone="green"
              />
            )}
            {showCheckInCard && todaySession && (
              <ActionCard
                href="/attendance"
                emoji="📍"
                title="오늘 출석 체크"
                subtitle={`${formatDateKR(todaySession.date)} · ${todaySession.session_number}회차`}
                tone="amber"
              />
            )}
            {showEvalCard && evalSession && (
              <ActionCard
                href="/evaluation"
                emoji="⭐"
                title="이번주 평가하기"
                subtitle={`${formatDateKR(evalSession.date)} 회차 — 미응답 ${evalUnfinishedCount}건`}
                tone="amber"
              />
            )}
          </div>
        </section>
      )}


      {/* 운영자 액션 영역 */}
      {member.is_admin && (
        <>
          <SectionDivider label="운영자 액션" />

          <Link
            href="/admin"
            className="mb-4 flex items-center justify-between rounded-2xl border border-gray-900 bg-gray-900 p-4 text-white hover:bg-gray-800"
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

          {/* 사전참석 안내 메시지 — D-2 ~ D-1 */}
          {nextSession && daysToNext !== null && (daysToNext === 1 || daysToNext === 2) && (
            <PreAttendanceNoticeCard
              session={nextSession}
              presentations={nextPresentations}
              allMembers={allMembers}
              daysToNext={daysToNext}
            />
          )}

          {/* 사전참석 미응답자 재안내 — D-1 + 미응답 1명 이상 */}
          {nextSession && daysToNext === 1 && unresponded.length > 0 && (
            <UnrespondedReminderCard
              session={nextSession}
              unresponded={unresponded}
            />
          )}

          {/* 출석 안내 메시지 — 당일 18:00 ~ 18:30 */}
          {todaySession &&
            nowMinutes >= NOTICE_WINDOW_START &&
            nowMinutes < NOTICE_WINDOW_END && (
              <CheckInNoticeCard session={todaySession} />
            )}
        </>
      )}

      {/* 내 정보 미리보기 — 페이지 맨 하단 */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="mb-3 text-xs font-bold text-gray-500">📊 내 정보</div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-gray-500">보증금 잔액</div>
            <div className="mt-1 text-2xl font-bold text-green-900">
              {myBalance !== null ? formatKRW(myBalance) : '-'}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">이번 분기 출석률</div>
            <div className="mt-1 text-2xl font-bold text-amber-900">
              {myAttendanceRate !== null ? `${myAttendanceRate}%` : '-'}
            </div>
          </div>
        </div>
        <Link
          href="/me"
          className="mt-4 flex h-12 items-center justify-center gap-1 rounded-xl border border-gray-300 bg-white text-sm font-bold text-gray-800 hover:bg-gray-50"
        >
          내 정보 자세히 보기
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    </>
  )
}

function PreAttendanceNoticeCard({
  session,
  presentations,
  allMembers,
  daysToNext
}: {
  session: Session
  presentations: Presentation[]
  allMembers: Member[]
  daysToNext: number
}) {
  const memberName = (id: string | null | undefined) =>
    id ? allMembers.find(m => m.id === id)?.name ?? '(이전 멤버)' : ''
  const lines = presentations
    .filter(p => p.presenter_id || p.special_label)
    .map(p =>
      p.special_label
        ? `- ${p.special_label}`
        : `- ${memberName(p.presenter_id)}님${p.company_name ? ` - ${p.company_name}` : ''}`
    )
  const presenterBlock = lines.length > 0 ? lines.join('\n') : '- (발표자 미정)'

  // 마감 = 회차 당일 스터디 시작 10분 전 (18:50 KST)
  const urlLine = APP_URL ? `\n👉 ${APP_URL}/attendance` : ''

  const message = [
    '종가투 형님들 안녕하세요!',
    '',
    `${formatDateKR(session.date)} 스터디 사전참석 부탁드립니다.`,
    '',
    '📢 발표자',
    presenterBlock,
    '',
    `답변 마감: ${formatDateKR(session.date)} ${formatMinutesKR(PRE_ATTENDANCE_CUTOFF_MINUTES)} (스터디 10분 전)${urlLine}`
  ].join('\n')

  return (
    <section className="mb-3 rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold text-gray-900">📢 사전참석 안내 메시지</div>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-700">
          D-{daysToNext}
        </span>
      </div>
      <p className="mt-1 text-xs text-gray-600">단톡방에 복사해 보내주세요.</p>
      <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-sm leading-relaxed text-gray-800">
{message}
      </pre>
      <CopyShareButtons message={message} shareTitle="종가투 사전참석 안내" />
    </section>
  )
}

function UnrespondedReminderCard({
  session,
  unresponded
}: {
  session: Session
  unresponded: { id: string; name: string }[]
}) {
  const names = unresponded.map(u => u.name).join(', ')
  const urlLine = APP_URL ? `\n👉 ${APP_URL}/attendance` : ''
  const message = [
    '종가투 사전참석 안내드립니다 🙏',
    '',
    '인원 파악을 위해 아래 분들도 답변 부탁드립니다:',
    names,
    '',
    '편하실 때 한 번씩만 눌러주세요.' + urlLine
  ].join('\n')

  return (
    <section className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold text-amber-900">📢 사전참석 인원 파악 부탁</div>
        <span className="rounded-full bg-amber-600 px-2 py-0.5 text-[10px] font-bold text-white">
          D-1 · {unresponded.length}명 미응답
        </span>
      </div>
      <p className="mt-1 text-xs text-amber-800">
        {session.session_number}회차 인원 파악을 위해 단톡방에 복사해 보내주세요.
      </p>
      <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-amber-200 bg-white p-3 text-sm leading-relaxed text-gray-800">
{message}
      </pre>
      <CopyShareButtons
        message={message}
        shareTitle="종가투 사전참석 인원 파악"
      />
    </section>
  )
}

function CheckInNoticeCard({ session }: { session: Session }) {
  const urlLine = APP_URL ? `\n👉 ${APP_URL}` : ''
  const message = [
    '오늘 7시 종가투 스터디입니다.',
    '도착하시면 앱에서 출석 체크 부탁드립니다.' + urlLine
  ].join('\n')

  return (
    <section className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold text-amber-900">📢 출석 안내 메시지</div>
        <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-900">
          오늘 #{session.session_number}회차
        </span>
      </div>
      <p className="mt-1 text-xs text-amber-800">단톡방에 복사해 보내주세요.</p>
      <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-amber-100 bg-white p-3 text-sm leading-relaxed text-gray-800">
{message}
      </pre>
      <CopyShareButtons message={message} shareTitle="종가투 출석 안내" />
    </section>
  )
}

function ActionCard({
  href,
  emoji,
  title,
  subtitle,
  tone
}: {
  href: string
  emoji: string
  title: string
  subtitle: string
  tone: 'green' | 'amber'
}) {
  const toneCls =
    tone === 'amber'
      ? 'border-amber-300 bg-amber-50 hover:bg-amber-100'
      : 'border-green-200 bg-white hover:bg-green-50'
  const titleCls = tone === 'amber' ? 'text-amber-900' : 'text-gray-900'
  const subCls = tone === 'amber' ? 'text-amber-800' : 'text-gray-600'
  return (
    <Link
      href={href}
      className={`flex min-h-14 items-center justify-between rounded-2xl border px-4 py-3 transition ${toneCls}`}
    >
      <div className="flex items-center gap-3">
        <span className="text-xl" aria-hidden>
          {emoji}
        </span>
        <div>
          <div className={`text-base font-bold ${titleCls}`}>{title}</div>
          <div className={`text-xs ${subCls}`}>{subtitle}</div>
        </div>
      </div>
      <ChevronRight className="h-5 w-5 text-gray-400" />
    </Link>
  )
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="mb-3 mt-2 flex items-center gap-3">
      <div className="h-px flex-1 bg-gray-200" />
      <span className="text-xs font-bold text-gray-500">{label}</span>
      <div className="h-px flex-1 bg-gray-200" />
    </div>
  )
}

function AdminBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-green-700 px-2 py-0.5 text-[10px] text-white">
      <ShieldCheck className="h-2.5 w-2.5" />
      운영자
    </span>
  )
}

function TestBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-800">
      🧪 테스트
    </span>
  )
}
