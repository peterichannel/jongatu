'use client'

import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { Quarter } from '@/lib/types'
import { cn } from '@/lib/utils'
import type { EnrichedLog } from './page'

const ACTION_LABEL: Record<EnrichedLog['action'], string> = {
  reserve: '예약',
  release: '취소',
  transfer_in: '이동(IN)',
  transfer_out: '이동(OUT)',
  company_update: '종목 변경'
}

const ACTION_COLOR: Record<EnrichedLog['action'], string> = {
  reserve: 'bg-green-100 text-green-800',
  release: 'bg-red-100 text-red-800',
  transfer_in: 'bg-amber-100 text-amber-900',
  transfer_out: 'bg-amber-50 text-amber-700',
  company_update: 'bg-blue-100 text-blue-800'
}

const ACTIONS: EnrichedLog['action'][] = [
  'reserve',
  'release',
  'transfer_in',
  'transfer_out',
  'company_update'
]

export function LogsView({
  quarters,
  targetQuarter,
  logs
}: {
  quarters: Quarter[]
  targetQuarter: Quarter
  logs: EnrichedLog[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [actionFilter, setActionFilter] = useState<'all' | EnrichedLog['action']>('all')
  const [memberFilter, setMemberFilter] = useState('')

  const memberOptions = useMemo(() => {
    const set = new Set<string>()
    for (const l of logs) if (l.member_name && l.member_name !== '-') set.add(l.member_name)
    return Array.from(set).sort()
  }, [logs])

  const filtered = useMemo(
    () =>
      logs.filter(l => {
        if (actionFilter !== 'all' && l.action !== actionFilter) return false
        if (memberFilter && l.member_name !== memberFilter) return false
        return true
      }),
    [logs, actionFilter, memberFilter]
  )

  const onQuarterChange = (id: string) => {
    const params = new URLSearchParams(searchParams)
    params.set('quarter', id)
    router.push(`/admin/schedule/logs?${params.toString()}`)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-3">
        <div>
          <label htmlFor="lf-quarter" className="text-xs font-bold text-gray-600">
            분기
          </label>
          <select
            id="lf-quarter"
            value={targetQuarter.id}
            onChange={e => onQuarterChange(e.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm"
          >
            {quarters.map(q => (
              <option key={q.id} value={q.id}>
                {q.name}
                {q.is_active ? ' (활성)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="lf-action" className="text-xs font-bold text-gray-600">
            액션
          </label>
          <select
            id="lf-action"
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value as 'all' | EnrichedLog['action'])}
            className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm"
          >
            <option value="all">전체</option>
            {ACTIONS.map(a => (
              <option key={a} value={a}>
                {ACTION_LABEL[a]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="lf-member" className="text-xs font-bold text-gray-600">
            멤버
          </label>
          <select
            id="lf-member"
            value={memberFilter}
            onChange={e => setMemberFilter(e.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm"
          >
            <option value="">전체</option>
            {memberOptions.map(n => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          {filtered.length}건 (최근 200건 한도)
        </div>
        {filtered.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-gray-500">
            기록이 없습니다.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {filtered.map(l => (
              <li key={l.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-bold',
                          ACTION_COLOR[l.action]
                        )}
                      >
                        {ACTION_LABEL[l.action]}
                      </span>
                      <span className="text-sm font-semibold text-gray-900">
                        {l.member_name}
                      </span>
                      {l.session_number !== null && (
                        <span className="text-xs text-gray-600">
                          {l.session_number}회차 ({l.session_date}) · 슬롯 {l.slot}
                        </span>
                      )}
                    </div>
                    {l.action === 'company_update' && (
                      <div className="mt-1 text-xs text-gray-700">
                        종목: {l.previous_value || '(없음)'} → {l.new_value || '(없음)'}
                      </div>
                    )}
                    {l.action === 'transfer_out' && l.previous_value && (
                      <div className="mt-1 text-xs text-gray-600">
                        취소된 종목: {l.previous_value}
                      </div>
                    )}
                    {l.action === 'release' && l.previous_value && (
                      <div className="mt-1 text-xs text-gray-600">
                        취소된 종목: {l.previous_value}
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">{formatDateTime(l.created_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function formatDateTime(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`
}
