import Link from 'next/link'
import {
  CalendarCheck,
  Mic,
  ShieldCheck,
  Star,
  User,
  Wallet
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getAuthedMember } from '@/lib/member-auth'
import { formatKRW } from '@/lib/utils'
import type { Half, Member } from '@/lib/types'
import { TransactionList } from './transaction-list'
import { HalfSelector } from './quarter-selector'

export const revalidate = 0

const ATTENDANCE_LABEL = {
  present: '출석',
  late: '지각',
  absent: '결석',
  excused: '공결'
} as const

const ATTENDANCE_COLOR = {
  present: 'text-green-700',
  late: 'text-amber-700',
  absent: 'text-red-700',
  excused: 'text-gray-700'
} as const

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']
function formatDateKR(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  if (!y) return d
  const dt = new Date(Date.UTC(y, m - 1, day))
  return `${m}월 ${day}일 (${WEEKDAY[dt.getUTCDay()]})`
}

type PresentationHistoryItem = {
  presentationId: string
  date: string
  sessionNumber: number
  quarterName: string
  label: string
}

type ReceivedEvalGroup = {
  presentationId: string
  date: string
  label: string
  count: number
  avgTotal: number
  avgPrep: number
  avgDelivery: number
  avgQna: number
  avgTime: number
  avgAttract: number
  feedbacks: string[]
}

export default async function MePage({
  searchParams
}: {
  searchParams: { half?: string }
}) {
  let me: Member | null = null
  let envError: string | null = null
  let halves: Half[] = []
  let targetHalf: Half | null = null
  let initialAmount = 0
  let currentBalance = 0
  let transactions: { id: string; amount: number; reason: string; created_at: string }[] = []
  const attendanceCounts = { present: 0, late: 0, absent: 0, excused: 0 }
  let normalSessionCount = 0
  const presentationHistory: PresentationHistoryItem[] = []
  const receivedEvalGroups: ReceivedEvalGroup[] = []
  let overallEvalAvg: number | null = null

  try {
    const supabase = supabaseAdmin()
    const NONE = Promise.resolve({ data: null })

    // ── 1파: 인증 + 반기 목록 (서로 독립)
    const [meRes, halvesRes] = await Promise.all([
      getAuthedMember(),
      supabase.from('halves').select('*').order('start_date', { ascending: false })
    ])
    if (halvesRes.error) throw new Error(halvesRes.error.message)
    me = meRes
    halves = (halvesRes.data ?? []) as Half[]

    const requested = searchParams.half
    targetHalf =
      (requested && halves.find(h => h.id === requested)) ||
      halves.find(h => h.is_active) ||
      halves[0] ||
      null

    if (me) {
      const memberId = me.id

      // ── 2파: 발표 이력 + 대상 반기 보증금 + 대상 반기 회차
      const [presRes, depositRes, halfSessionsRes] = await Promise.all([
        // 발표 이력 — 본인이 발표자였던 모든 회차 (분기 무관)
        supabase
          .from('presentations')
          .select(
            'id, company_name, special_label, session:sessions(id, date, session_number, quarter:quarters(name))'
          )
          .eq('presenter_id', memberId),
        targetHalf
          ? supabase
              .from('deposits')
              .select('*')
              .eq('member_id', memberId)
              .eq('half_id', targetHalf.id)
              .maybeSingle()
          : NONE,
        targetHalf
          ? supabase
              .from('sessions')
              .select('id, type, is_test')
              .gte('date', targetHalf.start_date)
              .lte('date', targetHalf.end_date)
          : NONE
      ])

      const presRows = (presRes.data ?? []) as {
        id: string
        company_name: string | null
        special_label: string | null
        session: unknown
      }[]
      for (const row of presRows) {
        const sRaw = row.session
        const s = (Array.isArray(sRaw) ? sRaw[0] : sRaw) as
          | {
              id: string
              date: string
              session_number: number
              quarter: { name: string } | { name: string }[] | null
            }
          | null
        if (!s) continue
        const qRaw = s.quarter
        const qName = (Array.isArray(qRaw) ? qRaw[0]?.name : qRaw?.name) ?? ''
        presentationHistory.push({
          presentationId: row.id,
          date: s.date,
          sessionNumber: s.session_number,
          quarterName: qName,
          label: row.company_name ?? row.special_label ?? '(기업 미입력)'
        })
      }
      presentationHistory.sort((a, b) => b.date.localeCompare(a.date))

      const deposit = depositRes.data as {
        id: string
        initial_amount: number
        current_balance: number
      } | null
      if (deposit) {
        initialAmount = deposit.initial_amount
        currentBalance = deposit.current_balance
      } else if (targetHalf) {
        initialAmount = targetHalf.default_deposit
        currentBalance = targetHalf.default_deposit
      }

      const normalSessionIds = ((halfSessionsRes.data ?? []) as {
        id: string
        type: string
        is_test: boolean
      }[])
        .filter(s => s.type === 'normal' && !s.is_test)
        .map(s => s.id)
      normalSessionCount = normalSessionIds.length

      // ── 3파: 받은 평가 + 보증금 내역 + 출석 기록
      const [evalsRes, txRes, attsRes] = await Promise.all([
        presentationHistory.length > 0
          ? supabase
              .from('evaluations')
              .select(
                'presentation_id, preparation, delivery, qna, time_management, attractiveness, feedback'
              )
              .in(
                'presentation_id',
                presentationHistory.map(p => p.presentationId)
              )
          : NONE,
        deposit
          ? supabase
              .from('deposit_transactions')
              .select('id, amount, reason, created_at')
              .eq('deposit_id', deposit.id)
              .order('created_at', { ascending: false })
          : NONE,
        normalSessionIds.length > 0
          ? supabase
              .from('attendances')
              .select('status')
              .eq('member_id', memberId)
              .in('session_id', normalSessionIds)
          : NONE
      ])

      transactions = (txRes.data ?? []) as typeof transactions

      for (const a of (attsRes.data ?? []) as { status: string }[]) {
        const k = a.status as keyof typeof attendanceCounts
        if (k in attendanceCounts) attendanceCounts[k] += 1
      }

      // 받은 평가: 본인 발표 슬롯의 evaluations 그룹핑
      type EvalRow = {
        presentation_id: string
        preparation: number
        delivery: number
        qna: number
        time_management: number
        attractiveness: number
        feedback: string | null
      }
      const evals = (evalsRes.data ?? []) as EvalRow[]
      const groupMap = new Map<string, EvalRow[]>()
      for (const e of evals ?? []) {
        const arr = groupMap.get(e.presentation_id as string) ?? []
        arr.push(e)
        groupMap.set(e.presentation_id as string, arr)
      }

      let totalSum = 0
      let totalSlots = 0

      for (const p of presentationHistory) {
        const group = groupMap.get(p.presentationId) ?? []
        if (group.length === 0) continue
        const cnt = group.length
        const sumPrep = group.reduce((s, e) => s + (e.preparation as number), 0)
        const sumDel = group.reduce((s, e) => s + (e.delivery as number), 0)
        const sumQna = group.reduce((s, e) => s + (e.qna as number), 0)
        const sumTime = group.reduce((s, e) => s + (e.time_management as number), 0)
        const sumAtt = group.reduce((s, e) => s + (e.attractiveness as number), 0)
        const round1 = (n: number) => Math.round(n * 10) / 10
        const total = sumPrep + sumDel + sumQna + sumTime + sumAtt
        receivedEvalGroups.push({
          presentationId: p.presentationId,
          date: p.date,
          label: p.label,
          count: cnt,
          avgTotal: round1(total / (cnt * 5)),
          avgPrep: round1(sumPrep / cnt),
          avgDelivery: round1(sumDel / cnt),
          avgQna: round1(sumQna / cnt),
          avgTime: round1(sumTime / cnt),
          avgAttract: round1(sumAtt / cnt),
          feedbacks: group
            .map(e => (e.feedback as string | null) ?? '')
            .filter(f => f.trim().length > 0)
        })
        totalSum += total
        totalSlots += cnt * 5
      }
      if (totalSlots > 0) overallEvalAvg = Math.round((totalSum / totalSlots) * 10) / 10
    }
  } catch (e) {
    envError = e instanceof Error ? e.message : '데이터 로드 실패'
  }

  if (envError) {
    return (
      <main className="flex-1 px-5 py-6">
        <h1 className="mb-6 text-2xl font-bold">내 정보</h1>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {envError}
        </div>
      </main>
    )
  }

  if (!me) {
    return (
      <main className="flex-1 px-5 py-6">
        <h1 className="mb-6 text-2xl font-bold">내 정보</h1>
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-base font-semibold text-amber-900">로그인이 필요합니다</p>
            <p className="mt-1 text-sm text-amber-800">
              홈에서 본인 이름 선택 후 PIN을 입력해주세요.
            </p>
          </div>
          <Link href="/">
            <Button className="w-full">홈으로</Button>
          </Link>
        </div>
      </main>
    )
  }

  const memberName = me.name
  const totalAttendance =
    attendanceCounts.present +
    attendanceCounts.late +
    attendanceCounts.absent +
    attendanceCounts.excused
  const attended = attendanceCounts.present + attendanceCounts.late
  // 출석률 = (출석 + 지각) / 진행된 정상 회차. 진행된 회차 = 체크 기록이 있는 회차.
  const attendanceRate =
    totalAttendance > 0 ? Math.round((attended / totalAttendance) * 1000) / 10 : null

  return (
    <main className="flex-1 px-5 py-6">
      <h1 className="mb-1 text-2xl font-bold">{memberName}님</h1>
      {targetHalf && (
        <p className="mb-6 text-sm text-gray-500">{targetHalf.name} 반기</p>
      )}

      {/* 본인 프로필 */}
      <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100">
            <User className="h-6 w-6 text-gray-600" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-gray-900">{memberName}</span>
              {me.is_admin ? (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-green-700 px-2 py-0.5 text-[10px] font-bold text-white">
                  <ShieldCheck className="h-2.5 w-2.5" />
                  운영자
                </span>
              ) : (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-700">
                  멤버
                </span>
              )}
            </div>
            {me.joined_at && (
              <div className="mt-0.5 text-xs text-gray-500">
                가입일: {formatDateKR(me.joined_at)}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 반기 선택 */}
      {halves.length > 0 && targetHalf && (
        <HalfSelector halves={halves} currentId={targetHalf.id} />
      )}

      {/* 보증금 카드 */}
      <section className="mb-5 rounded-2xl bg-green-50 p-5">
        <div className="flex items-center gap-2 text-sm font-bold text-green-700">
          <Wallet className="h-4 w-4" />
          보증금 잔액
        </div>
        <div className="mt-2 text-3xl font-bold text-green-900">{formatKRW(currentBalance)}</div>
        <div className="mt-1 text-sm text-green-800">
          초기 {formatKRW(initialAmount)} ·{' '}
          {currentBalance < initialAmount ? (
            <span className="text-red-700">
              {formatKRW(initialAmount - currentBalance)} 차감됨
            </span>
          ) : (
            '차감 없음'
          )}
        </div>
        {transactions.length > 0 && (
          <div className="mt-4 border-t border-green-200 pt-3">
            <TransactionList transactions={transactions} />
          </div>
        )}
      </section>

{/* 출석 통계 + 출석률 */}
      <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
            <CalendarCheck className="h-4 w-4" />
            출석 통계
          </div>
          <div className="text-xs text-gray-500">
            정상 회차 {normalSessionCount}회 · 체크 {totalAttendance}회
          </div>
        </div>

        {attendanceRate !== null && (
          <div className="mb-4 rounded-xl bg-green-50 p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-semibold text-green-800">출석률</span>
              <span className="text-2xl font-bold text-green-900">{attendanceRate}%</span>
            </div>
            <div className="mt-1 text-xs text-green-700">
              (출석 + 지각) / 체크된 회차 — 결석/공결 제외
            </div>
          </div>
        )}

        <div className="grid grid-cols-4 gap-2 text-center">
          {(Object.keys(ATTENDANCE_LABEL) as (keyof typeof ATTENDANCE_LABEL)[]).map(k => (
            <div key={k}>
              <div className="text-xs text-gray-500">{ATTENDANCE_LABEL[k]}</div>
              <div className={`text-2xl font-bold ${ATTENDANCE_COLOR[k]}`}>
                {attendanceCounts[k]}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 발표 이력 — 분기 무관 전체 */}
      <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-700">
          <Mic className="h-4 w-4" />
          발표 이력 ({presentationHistory.length}회)
        </div>
        {presentationHistory.length === 0 ? (
          <p className="text-sm text-gray-500">아직 발표 이력이 없습니다.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {presentationHistory.map(p => (
              <li
                key={p.presentationId}
                className="flex items-baseline justify-between gap-3"
              >
                <span className="text-gray-600">
                  {formatDateKR(p.date)}
                  {p.quarterName ? ` · ${p.quarterName}` : ''}
                </span>
                <span className="text-right font-semibold text-gray-900">{p.label}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 받은 평가 — 발표 이력에 대한 평가 모음 */}
      <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
            <Star className="h-4 w-4" />
            받은 평가
          </div>
          {overallEvalAvg !== null && (
            <div className="text-right">
              <div className="text-xs text-gray-500">누적 평균</div>
              <div className="text-lg font-bold text-amber-700">⭐ {overallEvalAvg}</div>
            </div>
          )}
        </div>
        {receivedEvalGroups.length === 0 ? (
          <p className="text-sm text-gray-500">
            아직 받은 평가가 없습니다.
            {presentationHistory.length > 0 ? ' (평가 미응답 또는 운영자 미공개)' : ''}
          </p>
        ) : (
          <ul className="space-y-2">
            {receivedEvalGroups.map(g => (
              <li
                key={g.presentationId}
                className="overflow-hidden rounded-xl border border-gray-200"
              >
                <details className="group">
                  <summary className="flex cursor-pointer items-center justify-between gap-3 bg-gray-50 px-3 py-3 text-sm">
                    <span className="text-gray-700">
                      {formatDateKR(g.date)} · {g.label}
                    </span>
                    <span className="font-bold text-amber-700">
                      ⭐ {g.avgTotal}{' '}
                      <span className="text-xs font-normal text-gray-500">
                        ({g.count}명)
                      </span>
                    </span>
                  </summary>
                  <div className="space-y-3 border-t border-gray-100 bg-white p-3 text-sm">
                    <div className="grid grid-cols-5 gap-2 text-center">
                      <ScoreCell label="준비" value={g.avgPrep} />
                      <ScoreCell label="진행" value={g.avgDelivery} />
                      <ScoreCell label="Q&A" value={g.avgQna} />
                      <ScoreCell label="시간" value={g.avgTime} />
                      <ScoreCell label="매력도" value={g.avgAttract} />
                    </div>
                    {g.feedbacks.length > 0 && (
                      <div>
                        <div className="mb-1 text-xs font-semibold text-gray-600">
                          종합 피드백 ({g.feedbacks.length}건)
                        </div>
                        <ul className="space-y-2 text-sm leading-relaxed text-gray-800">
                          {g.feedbacks.map((f, i) => (
                            <li
                              key={i}
                              className="rounded-lg bg-gray-50 p-2 whitespace-pre-wrap"
                            >
                              {f}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}

function ScoreCell({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[10px] text-gray-500">{label}</div>
      <div className="text-sm font-bold text-gray-900">{value}</div>
    </div>
  )
}
