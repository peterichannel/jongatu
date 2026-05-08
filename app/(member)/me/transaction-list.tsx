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
  const date = new Date(d)
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${m}.${day}`
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
