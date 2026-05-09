'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import type { Quarter } from '@/lib/types'

export function QuarterSelector({
  quarters,
  currentId
}: {
  quarters: Quarter[]
  currentId: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const onChange = (id: string) => {
    const params = new URLSearchParams(searchParams)
    params.set('quarter', id)
    router.push(`/me?${params.toString()}`)
  }

  return (
    <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-4">
      <label htmlFor="me-quarter" className="text-xs font-bold text-gray-600">
        분기
      </label>
      <select
        id="me-quarter"
        value={currentId}
        onChange={e => onChange(e.target.value)}
        className="mt-1 h-12 w-full rounded-xl border border-gray-300 bg-white px-3 text-base outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
      >
        {quarters.map(q => (
          <option key={q.id} value={q.id}>
            {q.name}
            {q.is_active ? ' (활성)' : ''}
          </option>
        ))}
      </select>
    </section>
  )
}
