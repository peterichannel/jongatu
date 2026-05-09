'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronDown,
  ChevronUp,
  Plus,
  Pencil,
  Trash2,
  Wallet,
  Receipt,
  Check,
  X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Member, Quarter } from '@/lib/types'
import { formatKRW } from '@/lib/utils'
import { seoulDateISO } from '@/lib/seoul-time'

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

type FundCategory =
  | 'studyroom'
  | 'meal'
  | 'snack'
  | 'gift'
  | 'penalty'
  | 'membership'
  | 'other'

type FundTransaction = {
  id: string
  quarter_id: string
  amount: number
  category: FundCategory
  description: string | null
  date: string
}

const CATEGORY_LABEL: Record<FundCategory, string> = {
  studyroom: '스터디룸',
  meal: '식사',
  snack: '간식',
  gift: '선물',
  penalty: '페널티',
  membership: '회비',
  other: '기타'
}

const CATEGORY_ORDER: FundCategory[] = [
  'studyroom',
  'meal',
  'snack',
  'gift',
  'membership',
  'penalty',
  'other'
]

function formatShort(d: string) {
  const date = new Date(d)
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${m}.${day}`
}

export function FinanceManager({
  quarter,
  members,
  deposits,
  depositTransactions,
  fundTransactions: initialFundTx
}: {
  quarter: Quarter
  members: Member[]
  deposits: Deposit[]
  depositTransactions: DepositTransaction[]
  fundTransactions: FundTransaction[]
}) {
  const [tab, setTab] = useState<'deposits' | 'funds'>('deposits')

  return (
    <>
      <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl border border-gray-200 bg-white p-1">
        <TabButton active={tab === 'deposits'} onClick={() => setTab('deposits')}>
          <Wallet className="h-4 w-4" />
          보증금
        </TabButton>
        <TabButton active={tab === 'funds'} onClick={() => setTab('funds')}>
          <Receipt className="h-4 w-4" />
          운영비
        </TabButton>
      </div>

      {tab === 'deposits' ? (
        <DepositSection
          quarter={quarter}
          members={members}
          deposits={deposits}
          depositTransactions={depositTransactions}
        />
      ) : (
        <FundSection quarter={quarter} initialFundTx={initialFundTx} />
      )}
    </>
  )
}

function TabButton({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold transition ${
        active ? 'bg-green-600 text-white' : 'text-gray-700 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  )
}

/* ---------------- 보증금 섹션 ---------------- */

function DepositSection({
  quarter,
  members,
  deposits,
  depositTransactions
}: {
  quarter: Quarter
  members: Member[]
  deposits: Deposit[]
  depositTransactions: DepositTransaction[]
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const depositByMember = useMemo(() => {
    const m = new Map<string, Deposit>()
    for (const d of deposits) m.set(d.member_id, d)
    return m
  }, [deposits])
  const txByDeposit = useMemo(() => {
    const m = new Map<string, DepositTransaction[]>()
    for (const t of depositTransactions) {
      const arr = m.get(t.deposit_id) ?? []
      arr.push(t)
      m.set(t.deposit_id, arr)
    }
    return m
  }, [depositTransactions])

  return (
    <div className="space-y-2">
      {members.map(member => {
        const deposit = depositByMember.get(member.id)
        const balance = deposit?.current_balance ?? quarter.default_deposit
        const initial = deposit?.initial_amount ?? quarter.default_deposit
        const diff = balance - initial
        const txs = deposit ? txByDeposit.get(deposit.id) ?? [] : []
        const open = expanded === member.id

        return (
          <div key={member.id} className="rounded-xl border border-gray-200 bg-white">
            <button
              type="button"
              onClick={() => setExpanded(open ? null : member.id)}
              className="flex w-full items-center justify-between p-3 text-left"
              disabled={txs.length === 0}
            >
              <div className="flex-1">
                <div className="text-base font-bold text-gray-900">{member.name}</div>
                <div className="mt-0.5 text-xs text-gray-500">
                  초기 {formatKRW(initial)}
                  {diff !== 0 && ` · ${diff > 0 ? '+' : ''}${formatKRW(diff)}`}
                  {!deposit && ' · 미발급'}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className={`text-lg font-bold ${
                    balance < initial ? 'text-red-700' : 'text-green-700'
                  }`}
                >
                  {formatKRW(balance)}
                </div>
                {txs.length > 0 &&
                  (open ? (
                    <ChevronUp className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  ))}
              </div>
            </button>
            {open && txs.length > 0 && (
              <ul className="divide-y divide-gray-100 border-t border-gray-100">
                {txs.map(t => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between px-3 py-2 text-sm"
                  >
                    <div>
                      <div className="text-gray-900">{t.reason}</div>
                      <div className="text-xs text-gray-500">{formatShort(t.created_at)}</div>
                    </div>
                    <div className={t.amount < 0 ? 'font-bold text-red-700' : 'font-bold text-green-700'}>
                      {t.amount > 0 ? '+' : ''}
                      {formatKRW(t.amount)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ---------------- 운영비 섹션 ---------------- */

function FundSection({
  quarter,
  initialFundTx
}: {
  quarter: Quarter
  initialFundTx: FundTransaction[]
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div className="space-y-3">
      {adding ? (
        <FundForm
          quarterId={quarter.id}
          onCancel={() => setAdding(false)}
          onDone={() => {
            setAdding(false)
            router.refresh()
          }}
        />
      ) : (
        <Button onClick={() => setAdding(true)} className="w-full">
          <Plus className="h-5 w-5" />
          내역 추가
        </Button>
      )}

      {initialFundTx.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-gray-500">
          아직 내역이 없습니다.
        </div>
      ) : (
        <ul className="space-y-2">
          {initialFundTx.map(t =>
            editingId === t.id ? (
              <li key={t.id}>
                <FundForm
                  quarterId={quarter.id}
                  transaction={t}
                  onCancel={() => setEditingId(null)}
                  onDone={() => {
                    setEditingId(null)
                    router.refresh()
                  }}
                />
              </li>
            ) : (
              <li
                key={t.id}
                className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3"
              >
                <CategoryBadge category={t.category} />
                <div className="flex-1">
                  <div className="text-sm font-semibold text-gray-900">
                    {t.description || CATEGORY_LABEL[t.category]}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500">{formatShort(t.date)}</div>
                </div>
                <div
                  className={`font-bold ${
                    t.amount < 0 ? 'text-red-700' : 'text-green-700'
                  }`}
                >
                  {t.amount > 0 ? '+' : ''}
                  {formatKRW(t.amount)}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditingId(t.id)}
                  aria-label="수정"
                  disabled={t.category === 'penalty'}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    if (!confirm('삭제하시겠습니까?')) return
                    const r = await fetch(`/api/admin/fund-transactions/${t.id}`, {
                      method: 'DELETE'
                    })
                    if (r.ok) router.refresh()
                    else alert('삭제 실패')
                  }}
                  aria-label="삭제"
                  disabled={t.category === 'penalty'}
                >
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </li>
            )
          )}
        </ul>
      )}
      <p className="text-xs text-gray-500">
        ⓘ &lsquo;페널티&rsquo; 카테고리는 자동 입력되며 수정/삭제할 수 없습니다.
      </p>
    </div>
  )
}

function CategoryBadge({ category }: { category: FundCategory }) {
  const colors: Record<FundCategory, string> = {
    studyroom: 'bg-blue-100 text-blue-800',
    meal: 'bg-orange-100 text-orange-800',
    snack: 'bg-yellow-100 text-yellow-800',
    gift: 'bg-pink-100 text-pink-800',
    penalty: 'bg-red-100 text-red-800',
    membership: 'bg-green-100 text-green-800',
    other: 'bg-gray-100 text-gray-800'
  }
  return (
    <span
      className={`inline-flex h-7 w-14 shrink-0 items-center justify-center rounded-full text-xs font-bold ${colors[category]}`}
    >
      {CATEGORY_LABEL[category]}
    </span>
  )
}

function FundForm({
  quarterId,
  transaction,
  onCancel,
  onDone
}: {
  quarterId: string
  transaction?: FundTransaction
  onCancel: () => void
  onDone: () => void
}) {
  const [category, setCategory] = useState<FundCategory>(transaction?.category ?? 'meal')
  const [sign, setSign] = useState<'income' | 'expense'>(
    (transaction?.amount ?? -1) >= 0 ? 'income' : 'expense'
  )
  const [amountStr, setAmountStr] = useState<string>(
    transaction ? Math.abs(transaction.amount).toString() : ''
  )
  const [description, setDescription] = useState(transaction?.description ?? '')
  const [date, setDate] = useState(transaction?.date ?? seoulDateISO())
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const isEditingPenalty = transaction?.category === 'penalty'

  const submit = async () => {
    setError('')
    const num = Number(amountStr)
    if (!num || num <= 0) {
      setError('금액을 입력하세요.')
      return
    }
    setPending(true)
    const signedAmount = sign === 'income' ? num : -num
    const body = {
      quarter_id: quarterId,
      amount: signedAmount,
      category,
      description,
      date
    }
    const url = transaction
      ? `/api/admin/fund-transactions/${transaction.id}`
      : '/api/admin/fund-transactions'
    const method = transaction ? 'PATCH' : 'POST'
    const r = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
    setPending(false)
    if (r.ok) onDone()
    else {
      const j = await r.json().catch(() => ({}))
      setError(j.error || '저장 실패')
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-base font-bold">{transaction ? '내역 수정' : '내역 추가'}</div>
      {isEditingPenalty && (
        <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
          페널티는 자동 생성된 내역입니다. 카테고리/금액 변경은 권장하지 않습니다.
        </p>
      )}
      <div>
        <Label htmlFor="f-cat">카테고리</Label>
        <select
          id="f-cat"
          value={category}
          onChange={e => setCategory(e.target.value as FundCategory)}
          className="mt-1 h-14 w-full rounded-xl border border-gray-300 bg-white px-4 text-lg outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
        >
          {CATEGORY_ORDER.map(c => (
            <option key={c} value={c}>
              {CATEGORY_LABEL[c]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label>입금 / 지출</Label>
        <div className="mt-1 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setSign('income')}
            className={`rounded-xl border-2 py-3 text-base font-bold transition ${
              sign === 'income'
                ? 'border-blue-600 bg-blue-50 text-blue-900'
                : 'border-gray-200 bg-white text-gray-700'
            }`}
          >
            + 입금
          </button>
          <button
            type="button"
            onClick={() => setSign('expense')}
            className={`rounded-xl border-2 py-3 text-base font-bold transition ${
              sign === 'expense'
                ? 'border-red-600 bg-red-50 text-red-900'
                : 'border-gray-200 bg-white text-gray-700'
            }`}
          >
            − 지출
          </button>
        </div>
      </div>
      <div>
        <Label htmlFor="f-amount">금액 (원)</Label>
        <Input
          id="f-amount"
          type="number"
          inputMode="numeric"
          value={amountStr}
          onChange={e => setAmountStr(e.target.value.replace(/\D/g, ''))}
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="f-date">날짜</Label>
        <Input
          id="f-date"
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="f-desc">메모 (선택)</Label>
        <Input
          id="f-desc"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="예: 1회차 스터디룸 대여"
          className="mt-1"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending} className="flex-1">
          <Check className="h-5 w-5" />
          {pending ? '저장 중...' : '저장'}
        </Button>
        <Button variant="secondary" onClick={onCancel} className="flex-1">
          <X className="h-5 w-5" />
          취소
        </Button>
      </div>
    </div>
  )
}
