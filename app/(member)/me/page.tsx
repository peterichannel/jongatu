import Link from 'next/link'
import {
  AlertCircle,
  ArrowRight,
  CalendarCheck,
  ShieldCheck,
  Wallet
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getAuthedMember } from '@/lib/member-auth'
import { formatKRW } from '@/lib/utils'
import type { Quarter } from '@/lib/types'
import { TransactionList } from './transaction-list'
import { QuarterSelector } from './quarter-selector'

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

type PendingPreview = {
  attendanceId: string
  sessionNumber: number
  date: string
  status: 'late' | 'absent'
  amount: number
}

export default async function MePage({
  searchParams
}: {
  searchParams: { quarter?: string }
}) {
  const me = await getAuthedMember()

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

  const memberId = me.id
  const memberName = me.name
  let envError: string | null = null
  let quarters: Quarter[] = []
  let targetQuarter: Quarter | null = null
  let initialAmount = 0
  let currentBalance = 0
  let transactions: { id: string; amount: number; reason: string; created_at: string }[] = []
  const attendanceCounts = { present: 0, late: 0, absent: 0, excused: 0 }
  let normalSessionCount = 0
  const pendingPreviews: PendingPreview[] = []

  try {
    const supabase = supabaseAdmin()

    const { data: qs, error: qErr } = await supabase
      .from('quarters')
      .select('*')
      .order('start_date', { ascending: false })
    if (qErr) throw new Error(qErr.message)
    quarters = (qs ?? []) as Quarter[]

    const requested = searchParams.quarter
    targetQuarter =
      (requested && quarters.find(q => q.id === requested)) ||
      quarters.find(q => q.is_active) ||
      quarters[0] ||
      null

    if (targetQuarter) {
      const { data: deposit } = await supabase
        .from('deposits')
        .select('*')
        .eq('member_id', memberId)
        .eq('quarter_id', targetQuarter.id)
        .maybeSingle()
      if (deposit) {
        initialAmount = deposit.initial_amount
        currentBalance = deposit.current_balance
        const { data: tx } = await supabase
          .from('deposit_transactions')
          .select('id, amount, reason, created_at')
          .eq('deposit_id', deposit.id)
          .order('created_at', { ascending: false })
        transactions = tx ?? []
      } else {
        initialAmount = targetQuarter.default_deposit
        currentBalance = targetQuarter.default_deposit
      }

      const { data: quarterSessions } = await supabase
        .from('sessions')
        .select('id, type, is_test')
        .eq('quarter_id', targetQuarter.id)
      const normalSessionIds = (quarterSessions ?? [])
        .filter(s => s.type === 'normal' && !s.is_test)
        .map(s => s.id)
      normalSessionCount = normalSessionIds.length

      if (normalSessionIds.length > 0) {
        const { data: atts } = await supabase
          .from('attendances')
          .select('status')
          .eq('member_id', memberId)
          .in('session_id', normalSessionIds)
        for (const a of atts ?? []) {
          const k = a.status as keyof typeof attendanceCounts
          if (k in attendanceCounts) attendanceCounts[k] += 1
        }

        // 미확정 attendances → 확정 시 적용될 페널티 프리뷰 (late/absent 만, is_test 제외)
        const { data: rules } = await supabase
          .from('penalty_rules')
          .select('rule_key, amount')
          .in('rule_key', ['late', 'absent'])
          .eq('is_active', true)
        const ruleMap = new Map<string, number>(
          (rules ?? []).map(r => [r.rule_key as string, r.amount as number])
        )

        const { data: pending } = await supabase
          .from('attendances')
          .select(
            'id, status, sessions:session_id(id, date, session_number, type, is_test)'
          )
          .eq('member_id', memberId)
          .eq('is_confirmed', false)
          .in('session_id', normalSessionIds)

        for (const row of pending ?? []) {
          const sRaw = row.sessions as unknown
          const s = (Array.isArray(sRaw) ? sRaw[0] : sRaw) as
            | { date: string; session_number: number; type: string; is_test: boolean }
            | null
            | undefined
          if (!s || s.type !== 'normal' || s.is_test) continue
          if (row.status !== 'late' && row.status !== 'absent') continue
          const amt = ruleMap.get(row.status) ?? 0
          pendingPreviews.push({
            attendanceId: row.id as string,
            sessionNumber: s.session_number,
            date: s.date,
            status: row.status as 'late' | 'absent',
            amount: amt
          })
        }
        pendingPreviews.sort((a, b) => a.date.localeCompare(b.date))
      }
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

  const totalAttendance =
    attendanceCounts.present +
    attendanceCounts.late +
    attendanceCounts.absent +
    attendanceCounts.excused
  const attended = attendanceCounts.present + attendanceCounts.late
  // 출석률 = (출석 + 지각) / 진행된 정상 회차. 진행된 회차 = 체크 기록이 있는 회차.
  const attendanceRate =
    totalAttendance > 0 ? Math.round((attended / totalAttendance) * 1000) / 10 : null
  const pendingTotal = pendingPreviews.reduce((sum, p) => sum + p.amount, 0)

  return (
    <main className="flex-1 px-5 py-6">
      <h1 className="mb-1 text-2xl font-bold">{memberName}님</h1>
      {targetQuarter && (
        <p className="mb-6 text-sm text-gray-500">{targetQuarter.name} 분기</p>
      )}

      {/* 운영자 메뉴 */}
      {me.is_admin && (
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

      {/* 분기 선택 */}
      {quarters.length > 0 && targetQuarter && (
        <QuarterSelector quarters={quarters} currentId={targetQuarter.id} />
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

      {/* 확정 대기 페널티 프리뷰 */}
      {pendingPreviews.length > 0 && (
        <section className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-center gap-2 text-sm font-bold text-amber-900">
            <AlertCircle className="h-4 w-4" />
            확정 대기 ({pendingPreviews.length}건)
          </div>
          <p className="mt-1 text-xs text-amber-800">
            아래 항목은 운영자가 출결을 확정하면 보증금에서 차감됩니다.
          </p>
          <ul className="mt-3 space-y-1.5 text-sm text-amber-900">
            {pendingPreviews.map(p => (
              <li key={p.attendanceId} className="flex items-baseline justify-between gap-3">
                <span>
                  {formatDateKR(p.date)} #{p.sessionNumber} ·{' '}
                  {p.status === 'late' ? '지각' : '결석'}
                </span>
                <span className="font-bold text-red-700">{formatKRW(p.amount)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-baseline justify-between border-t border-amber-200 pt-3">
            <span className="text-sm font-bold text-amber-900">예상 추가 차감</span>
            <span className="text-lg font-bold text-red-700">{formatKRW(pendingTotal)}</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xs text-amber-800">확정 후 예상 잔액</span>
            <span className="text-sm font-bold text-amber-900">
              {formatKRW(currentBalance + pendingTotal)}
            </span>
          </div>
        </section>
      )}

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
    </main>
  )
}
