import Link from 'next/link'
import { CalendarCheck, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getAuthedMember } from '@/lib/member-auth'
import { formatKRW } from '@/lib/utils'
import { TransactionList } from './transaction-list'

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

export default async function MePage() {
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
  let quarterName = ''
  let initialAmount = 0
  let currentBalance = 0
  let transactions: { id: string; amount: number; reason: string; created_at: string }[] = []
  const attendanceCounts = { present: 0, late: 0, absent: 0, excused: 0 }

  try {
    const supabase = supabaseAdmin()

    const { data: q } = await supabase
      .from('quarters')
      .select('*')
      .eq('is_active', true)
      .maybeSingle()
    if (q) {
      quarterName = q.name

      const { data: deposit } = await supabase
        .from('deposits')
        .select('*')
        .eq('member_id', memberId)
        .eq('quarter_id', q.id)
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
        initialAmount = q.default_deposit
        currentBalance = q.default_deposit
      }

      const { data: quarterSessions } = await supabase
        .from('sessions')
        .select('id, type')
        .eq('quarter_id', q.id)
      const normalSessionIds = (quarterSessions ?? [])
        .filter(s => s.type === 'normal')
        .map(s => s.id)

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

  return (
    <main className="flex-1 px-5 py-6">
      <h1 className="mb-1 text-2xl font-bold">{memberName}님</h1>
      {quarterName && <p className="mb-6 text-sm text-gray-500">{quarterName} 분기</p>}

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

      {/* 출석 통계 */}
      <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-700">
          <CalendarCheck className="h-4 w-4" />
          출석 통계 (이번 분기 · 총 {totalAttendance}회)
        </div>
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

      {/* 발표 평가 결과는 운영진이 분기 종료 후 별도 모임에서 통합 안내 */}
      <section className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm text-gray-600">
        발표 평가 결과는 분기 종료 후 운영진이 통합 정리하여 별도 모임에서 안내드립니다.
      </section>
    </main>
  )
}
