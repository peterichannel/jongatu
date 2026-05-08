'use client'

import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Session } from '@/lib/types'

export const SESSION_TYPE_LABEL = {
  normal: '정상',
  rest: '휴강',
  dinner: '식사',
  social: '친목',
  event: '이벤트'
} as const

export type SessionType = keyof typeof SESSION_TYPE_LABEL

export function SessionForm({
  mode,
  quarterId,
  session,
  defaultSessionNumber,
  onCancel,
  onDone
}: {
  mode: 'create' | 'edit'
  quarterId?: string
  session?: Session
  defaultSessionNumber?: number
  onCancel: () => void
  onDone: () => void
}) {
  const [sessionNumber, setSessionNumber] = useState<string>(
    (session?.session_number ?? defaultSessionNumber ?? 1).toString()
  )
  const [date, setDate] = useState(session?.date ?? '')
  const [type, setType] = useState<SessionType>(session?.type ?? 'normal')
  const [note, setNote] = useState(session?.note ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setError('')
    const num = Number(sessionNumber)
    if (!num || num < 1) {
      setError('회차 번호를 입력하세요.')
      return
    }
    if (!date) {
      setError('날짜를 선택하세요.')
      return
    }
    setPending(true)
    const body: Record<string, unknown> = {
      session_number: num,
      date,
      type,
      note
    }
    if (mode === 'create') body.quarter_id = quarterId
    const url = mode === 'create' ? '/api/admin/sessions' : `/api/admin/sessions/${session!.id}`
    const method = mode === 'create' ? 'POST' : 'PATCH'
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
      <div className="text-base font-bold text-gray-900">
        {mode === 'create' ? '회차 추가' : '회차 수정'}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="s-num">회차 번호</Label>
          <Input
            id="s-num"
            type="number"
            inputMode="numeric"
            value={sessionNumber}
            onChange={e => setSessionNumber(e.target.value.replace(/\D/g, ''))}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="s-date">날짜</Label>
          <Input
            id="s-date"
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="mt-1"
          />
        </div>
      </div>
      <div>
        <Label htmlFor="s-type">유형</Label>
        <select
          id="s-type"
          value={type}
          onChange={e => setType(e.target.value as SessionType)}
          className="mt-1 h-14 w-full rounded-xl border border-gray-300 bg-white px-4 text-lg outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
        >
          {(Object.keys(SESSION_TYPE_LABEL) as SessionType[]).map(t => (
            <option key={t} value={t}>
              {SESSION_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="s-note">메모 (선택)</Label>
        <Input
          id="s-note"
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="예: 추석 휴강"
          className="mt-1"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2 pt-1">
        <Button onClick={submit} className="flex-1" disabled={pending}>
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
