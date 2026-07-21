import Link from 'next/link'
import { ChevronLeft, FileText } from 'lucide-react'
import { supabaseAdmin } from '@/lib/supabase/server'
import { formatKRW } from '@/lib/utils'
import type { Half, Member } from '@/lib/types'
import { FinanceManager } from './finance-manager'

export const revalidate = 0

type Deposit = {
  id: string
  member_id: string
  initial_amount: number
  current_balance: number
}

type DepositTransaction = {
  id: string
  deposit_id: string
  amount: number
  reason: string
  created_at: string
}

type FundTransaction = {
  id: string
  half_id: string
  amount: number
  category: 'studyroom' | 'meal' | 'snack' | 'gift' | 'penalty' | 'membership' | 'other'
  description: string | null
  date: string
}

export default async function FinancePage() {
  let envError: string | null = null
  let half: Half | null = null
  let members: Member[] = []
  let deposits: Deposit[] = []
  let depositTransactions: DepositTransaction[] = []
  let fundTransactions: FundTransaction[] = []

  try {
    const supabase = supabaseAdmin()

    // ── 1파: 활성 반기 + 명단 (서로 독립)
    const [halfRes, membersRes] = await Promise.all([
      supabase.from('halves').select('*').eq('is_active', true).maybeSingle(),
      supabase.from('members').select('*').eq('is_active', true).order('name')
    ])
    if (halfRes.error) throw new Error(halfRes.error.message)
    half = halfRes.data
    members = membersRes.data ?? []

    if (half) {
      // ── 2파: 반기 보증금 + 운영비 내역
      const [depositsRes, fundRes] = await Promise.all([
        supabase.from('deposits').select('*').eq('half_id', half.id),
        supabase
          .from('fund_transactions')
          .select('*')
          .eq('half_id', half.id)
          .order('date', { ascending: false })
      ])
      deposits = (depositsRes.data as Deposit[]) ?? []
      fundTransactions = (fundRes.data as FundTransaction[]) ?? []

      // ── 3파: 보증금 거래 내역 (deposits 에 의존)
      if (deposits.length > 0) {
        const { data: dtx } = await supabase
          .from('deposit_transactions')
          .select('*')
          .in(
            'deposit_id',
            deposits.map(d => d.id)
          )
          .order('created_at', { ascending: false })
        depositTransactions = (dtx as DepositTransaction[]) ?? []
      }
    }
  } catch (e) {
    envError = e instanceof Error ? e.message : '데이터 로드 실패'
  }

  const totalDeposit = deposits.reduce((acc, d) => acc + d.current_balance, 0)
  const fundIncome = fundTransactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const fundExpense = fundTransactions.filter(t => t.amount < 0).reduce((s, t) => s + t.amount, 0)
  const fundBalance = fundIncome + fundExpense

  return (
    <div>
      <Link
        href="/admin"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ChevronLeft className="h-4 w-4" /> 관리자 홈
      </Link>
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-bold">정산</h1>
        {half && (
          <Link
            href="/admin/finance/report"
            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            <FileText className="h-4 w-4" />
            정산서 보기
          </Link>
        )}
      </div>
      {half && <p className="mb-6 text-sm text-gray-600">{half.name} 반기</p>}

      {envError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {envError}
        </div>
      ) : !half ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          활성 반기가 없습니다.
        </div>
      ) : (
        <>
          {/* 반기 요약 */}
          <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard label="총 보증금 잔액" value={totalDeposit} color="text-green-700" />
            <SummaryCard label="운영비 입금" value={fundIncome} color="text-blue-700" />
            <SummaryCard label="운영비 지출" value={fundExpense} color="text-red-700" />
            <SummaryCard label="운영비 잔액" value={fundBalance} color="text-gray-900" />
          </section>

          <FinanceManager
            half={half}
            members={members}
            deposits={deposits}
            depositTransactions={depositTransactions}
            fundTransactions={fundTransactions}
          />
        </>
      )}
    </div>
  )
}

function SummaryCard({
  label,
  value,
  color
}: {
  label: string
  value: number
  color: string
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-1 text-lg font-bold ${color}`}>{formatKRW(value)}</div>
    </div>
  )
}
