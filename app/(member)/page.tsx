import Link from 'next/link'
import {
  ArrowRight,
  CalendarCheck,
  ChevronRight,
  ClipboardCheck,
  ShieldCheck,
  Star
} from 'lucide-react'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getAuthedMember } from '@/lib/member-auth'
import { addDaysSeoulISO, seoulDateISO, seoulMinutesOfDay } from '@/lib/seoul-time'
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
  let unresponded: { id: string; name: string }[] = []

  // 가드 분기 위해 me 를 먼저 조회 (비운영진은 is_test 회차 숨김)
  const me = await getAuthedMember()

  try {
    const supabase = supabaseAdmin()
    const { data: ms, error } = await supabase
      .from('members')
      .select('id, name, joined_at, is_active, is_admin, created_at, pin_hash')
      .eq('is_active', true)
      .order('name')
    if (error) throw new Error(error.message)
    members = (ms ?? []) as Member[]

    const { data: q } = await supabase
      .from('quarters')
      .select('id')
      .eq('is_active', true)
      .maybeSingle()

    if (q) {
      const today = seoulDateISO()

      // 다음 회차 (오늘 포함 이후)
      let nextQuery = supabase
        .from('sessions')
        .select('*')
        .eq('quarter_id', q.id)
        .eq('type', 'normal')
        .gte('date', today)
      if (!me?.is_admin) nextQuery = nextQuery.eq('is_test', false)
      const { data: ns } = await nextQuery
        .order('date', { ascending: true })
        .limit(1)
        .maybeSingle()
      nextSession = ns ?? null

      if (nextSession) {
        const { data: pres } = await supabase
          .from('presentations')
          .select('*')
          .eq('session_id', nextSession.id)
          .order('slot')
        nextPresentations = (pres ?? []) as Presentation[]
      }

      // 오늘 회차 (출석 체크 카드용)
      let todayQuery = supabase
        .from('sessions')
        .select('*')
        .eq('quarter_id', q.id)
        .eq('type', 'normal')
        .eq('date', today)
      if (!me?.is_admin) todayQuery = todayQuery.eq('is_test', false)
      const { data: ts } = await todayQuery.maybeSingle()
      todaySession = ts ?? null

      // 평가 대상 회차: 어제 이전 normal 중 가장 최근 (지난 회차 평가)
      if (me) {
        let evalQuery = supabase
          .from('sessions')
          .select('*')
          .eq('quarter_id', q.id)
          .eq('type', 'normal')
          .lt('date', today)
        if (!me.is_admin) evalQuery = evalQuery.eq('is_test', false)
        const { data: es } = await evalQuery
          .order('date', { ascending: false })
          .limit(1)
          .maybeSingle()
        evalSession = es ?? null
      }

      // 본인 사전참석/출석/평가 진행 상황
      if (me) {
        if (nextSession) {
          const { data: pre } = await supabase
            .from('pre_attendances')
            .select('id')
            .eq('session_id', nextSession.id)
            .eq('member_id', me.id)
            .maybeSingle()
          myPreAttended = !!pre
        }
        if (todaySession) {
          const { data: att } = await supabase
            .from('attendances')
            .select('id')
            .eq('session_id', todaySession.id)
            .eq('member_id', me.id)
            .maybeSingle()
          myAttendanceToday = !!att
        }
        if (evalSession) {
          const { data: targets } = await supabase
            .from('presentations')
            .select('presenter_id, special_label')
            .eq('session_id', evalSession.id)
          const targetCount = (targets ?? []).filter(
            p => p.presenter_id && p.presenter_id !== me.id && !p.special_label
          ).length

          const { count: myEvalCount } = await supabase
            .from('evaluations')
            .select('*', { count: 'exact', head: true })
            .eq('session_id', evalSession.id)
            .eq('evaluator_id', me.id)

          evalUnfinishedCount = Math.max(targetCount - (myEvalCount ?? 0), 0)
        }

        // 운영자: 다음 회차 사전참석 미응답자 명단 (재안내 카드용)
        if (me.is_admin && nextSession) {
          const { data: allPre } = await supabase
            .from('pre_attendances')
            .select('member_id')
            .eq('session_id', nextSession.id)
          const respondedIds = new Set((allPre ?? []).map(p => p.member_id as string))
          unresponded = members
            .filter(m => !respondedIds.has(m.id))
            .map(m => ({ id: m.id, name: m.name }))
        }
      }
    }
  } catch (e) {
    envErrorMessage = e instanceof Error ? e.message : '데이터 로드 실패'
  }

  return (
    <main className="flex-1 px-5 py-6">
      <header className="mb-6">
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
          nextPresentations={nextPresentations}
          allMembers={members}
          todaySession={todaySession}
          evalSession={evalSession}
          myPreAttended={myPreAttended}
          myAttendanceToday={myAttendanceToday}
          evalUnfinishedCount={evalUnfinishedCount}
          unresponded={unresponded}
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
  unresponded
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
  unresponded: { id: string; name: string }[]
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

  // 평가 카드 노출: 평가 대상 회차 있고, 미완료 발표 있고, 다음 회차 D-2 전
  const showEvalCard =
    !!evalSession &&
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

          {/* TODO(다음 커밋): 출석 안내 / 출결 확정 알림 */}
        </>
      )}

      {/* TODO(다음 커밋): 내 정보 미리보기 카드 */}
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

  // 마감일 = 회차 전날 (D-1) 자정
  const deadlineISO = addDaysSeoulISO(session.date, -1)
  const urlLine = APP_URL ? `\n👉 ${APP_URL}/attendance` : ''

  const message = [
    '종가투 형님들 안녕하세요!',
    '',
    `${formatDateKR(session.date)} 스터디 사전참석 부탁드립니다.`,
    '',
    '📢 발표자',
    presenterBlock,
    '',
    `답변 마감: ${formatDateKR(deadlineISO)} 자정${urlLine}`
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
    '종가투 사전참석 마감 임박합니다 🙏',
    '',
    '아직 답변 안하신 분:',
    names,
    '',
    '오늘 자정까지 부탁드립니다.' + urlLine
  ].join('\n')

  return (
    <section className="mb-3 rounded-2xl border-2 border-red-300 bg-red-50 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold text-red-900">📢 사전참석 미응답자 재안내</div>
        <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">
          D-1 · {unresponded.length}명 미응답
        </span>
      </div>
      <p className="mt-1 text-xs text-red-800">
        {session.session_number}회차 마감 임박. 단톡방에 복사해 보내주세요.
      </p>
      <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-red-200 bg-white p-3 text-sm leading-relaxed text-gray-800">
{message}
      </pre>
      <CopyShareButtons
        message={message}
        shareTitle="종가투 사전참석 마감 임박"
        variant="danger"
      />
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
