'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { formatKRW } from '@/lib/utils'

type Transaction = {
  id: string
  amount: number
  reason: string
  created_at: string
}

function formatShort(d: string) {
  // Asia/Seoul 기준 MM.DD (브라우저 로컬 타임존이 다른 경우에도 일관)
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    month: '2-digit',
    day: '2-digit'
  })
    .format(new Date(d))
    .replace('-', '.')
}

export function TransactionList({ transactions }: { transactions: Transaction[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center justify-between text-left text-sm text-green-800 hover:underline"
      >
        <span>거래 내역 {transactions.length}건</span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5">
          {transactions.map(t => (
            <li key={t.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm">
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
}
