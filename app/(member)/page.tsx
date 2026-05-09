import Link from 'next/link'
import { ArrowRight, ShieldCheck } from 'lucide-react'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getAuthedMember } from '@/lib/member-auth'
import { seoulDateISO } from '@/lib/seoul-time'
import { MemberAuthFlow } from '@/components/MemberAuthFlow'
import type { Member, Presentation, Session } from '@/lib/types'

export const revalidate = 0

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']
function formatDateKR(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  if (!y) return d
  const dt = new Date(Date.UTC(y, m - 1, day))
  return `${m}월 ${day}일 (${WEEKDAY[dt.getUTCDay()]})`
}

export default async function HomePage() {
  let envErrorMessage: string | null = null
  let members: Member[] = []
  let nextSession: Session | null = null
  let nextPresentations: Presentation[] = []

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
  allMembers
}: {
  member: Member
  nextSession: Session | null
  nextPresentations: Presentation[]
  allMembers: Member[]
}) {
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

      {/* TODO(다음 커밋): "지금 해야 할 일" 액션 카드 (사전참석/출석/평가) */}

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

          {/* TODO(다음 커밋): 사전참석 안내 / 미응답자 재안내 / 출석 안내 / 출결 확정 알림 */}
        </>
      )}

      {/* TODO(다음 커밋): 내 정보 미리보기 카드 */}
    </>
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
