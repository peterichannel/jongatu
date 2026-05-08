'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Calendar,
  CalendarPlus,
  FileSpreadsheet,
  History,
  Pencil,
  Plus
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Member, Presentation, Quarter, Session } from '@/lib/types'
import { formatKRW } from '@/lib/utils'
import { SessionRow } from './session-row'
import { SessionForm } from './session-form'

export function ScheduleEditor({
  activeQuarter,
  allQuarters,
  sessions,
  presentations,
  members
}: {
  activeQuarter: Quarter | null
  allQuarters: Quarter[]
  sessions: Session[]
  presentations: Presentation[]
  members: Member[]
}) {
  const router = useRouter()
  const refresh = () => router.refresh()

  const [editingQuarter, setEditingQuarter] = useState(false)
  const [creatingQuarter, setCreatingQuarter] = useState(false)
  const [addingSession, setAddingSession] = useState(false)
  const [bulkCreating, setBulkCreating] = useState(false)

  const presentationsBySession = useMemo(() => {
    const map = new Map<string, Presentation[]>()
    for (const p of presentations) {
      const arr = map.get(p.session_id) ?? []
      arr.push(p)
      map.set(p.session_id, arr)
    }
    return map
  }, [presentations])

  const nextSessionNumber = useMemo(() => {
    const max = sessions.reduce((acc, s) => Math.max(acc, s.session_number), 0)
    return max + 1
  }, [sessions])

  if (!activeQuarter) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900">
          <p className="text-base font-semibold">아직 등록된 분기가 없습니다.</p>
          <p className="mt-1 text-sm">아래 버튼으로 첫 분기를 등록하세요.</p>
        </div>
        {creatingQuarter ? (
          <QuarterForm
            mode="create"
            onCancel={() => setCreatingQuarter(false)}
            onDone={() => {
              setCreatingQuarter(false)
              refresh()
            }}
          />
        ) : (
          <Button onClick={() => setCreatingQuarter(true)} className="w-full">
            <Plus className="h-5 w-5" />
            분기 등록
          </Button>
        )}
      </div>
    )
  }

  const otherQuarters = allQuarters.filter(q => q.id !== activeQuarter.id)

  return (
    <div className="space-y-6">
      {/* 분기 카드 */}
      <div className="rounded-2xl border border-green-200 bg-green-50 p-5">
        {!editingQuarter ? (
          <>
            <div className="mb-1 text-xs font-bold text-green-700">활성 분기</div>
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold text-green-900">{activeQuarter.name}</h2>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditingQuarter(true)}
                aria-label="분기 수정"
                className="text-green-800 hover:bg-green-100"
              >
                <Pencil className="h-4 w-4" />
                수정
              </Button>
            </div>
            <div className="mt-2 text-sm text-green-800">
              {activeQuarter.start_date} ~ {activeQuarter.end_date}
            </div>
            <div className="mt-1 text-sm text-green-800">
              초기 보증금 {formatKRW(activeQuarter.default_deposit)}
            </div>
          </>
        ) : (
          <QuarterForm
            mode="edit"
            quarter={activeQuarter}
            onCancel={() => setEditingQuarter(false)}
            onDone={() => {
              setEditingQuarter(false)
              refresh()
            }}
          />
        )}
      </div>

      {/* 다른 분기로 전환 */}
      {otherQuarters.length > 0 && (
        <details className="rounded-xl border border-gray-200 bg-white">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-gray-700">
            다른 분기 보기 ({otherQuarters.length})
          </summary>
          <ul className="divide-y divide-gray-200 border-t border-gray-200">
            {otherQuarters.map(q => (
              <li key={q.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <div className="font-medium">{q.name}</div>
                  <div className="text-xs text-gray-500">
                    {q.start_date} ~ {q.end_date}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const r = await fetch(`/api/admin/quarters/${q.id}`, {
                      method: 'PATCH',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ is_active: true })
                    })
                    if (r.ok) refresh()
                    else alert('전환 실패')
                  }}
                >
                  활성화
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* 새 분기 추가 */}
      {creatingQuarter ? (
        <QuarterForm
          mode="create"
          onCancel={() => setCreatingQuarter(false)}
          onDone={() => {
            setCreatingQuarter(false)
            refresh()
          }}
        />
      ) : (
        <button
          onClick={() => setCreatingQuarter(true)}
          className="w-full rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-600 hover:border-gray-400"
        >
          + 새 분기 등록
        </button>
      )}

      {/* 회차 목록 */}
      <div>
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-xl font-bold">회차 ({sessions.length})</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/schedule/logs"
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <History className="h-4 w-4" />
              예약 이력
            </Link>
            <Link
              href="/admin/schedule/import"
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <FileSpreadsheet className="h-4 w-4" />
              엑셀 임포트
            </Link>
          </div>
        </div>

        <div className="space-y-2">
          {addingSession ? (
            <SessionForm
              mode="create"
              quarterId={activeQuarter.id}
              defaultSessionNumber={nextSessionNumber}
              onCancel={() => setAddingSession(false)}
              onDone={() => {
                setAddingSession(false)
                refresh()
              }}
            />
          ) : (
            <Button onClick={() => setAddingSession(true)} className="w-full">
              <Plus className="h-5 w-5" />
              회차 1개 추가
            </Button>
          )}

          {bulkCreating ? (
            <BulkSessionForm
              quarterId={activeQuarter.id}
              defaultStartNumber={nextSessionNumber}
              onCancel={() => setBulkCreating(false)}
              onDone={() => {
                setBulkCreating(false)
                refresh()
              }}
            />
          ) : (
            <Button
              onClick={() => setBulkCreating(true)}
              variant="outline"
              className="w-full"
            >
              <CalendarPlus className="h-5 w-5" />
              여러 회차 일괄 등록 (날짜 + 슬롯 수)
            </Button>
          )}
        </div>

        <div className="mt-4 space-y-3">
          {sessions.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-gray-500">
              <Calendar className="mx-auto mb-2 h-8 w-8 text-gray-300" />
              아직 회차가 없습니다. 위 버튼으로 추가하세요.
            </div>
          ) : (
            sessions.map(s => (
              <SessionRow
                key={s.id}
                session={s}
                presentations={presentationsBySession.get(s.id) ?? []}
                members={members}
                onChanged={refresh}
              />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

/* ---------------- Quarter Form ---------------- */

function QuarterForm({
  mode,
  quarter,
  onCancel,
  onDone
}: {
  mode: 'create' | 'edit'
  quarter?: Quarter
  onCancel: () => void
  onDone: () => void
}) {
  const [name, setName] = useState(quarter?.name ?? '')
  const [startDate, setStartDate] = useState(quarter?.start_date ?? '')
  const [endDate, setEndDate] = useState(quarter?.end_date ?? '')
  const [deposit, setDeposit] = useState<string>(
    quarter?.default_deposit?.toString() ?? '45000'
  )
  const [operatingFee, setOperatingFee] = useState<string>(
    quarter?.operating_fee?.toString() ?? '30000'
  )
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setError('')
    if (!name.trim() || !startDate || !endDate) {
      setError('이름, 시작일, 종료일은 필수입니다.')
      return
    }
    if (startDate > endDate) {
      setError('시작일이 종료일보다 늦습니다.')
      return
    }
    setPending(true)
    const body = {
      name: name.trim(),
      start_date: startDate,
      end_date: endDate,
      default_deposit: Number(deposit) || 45000,
      operating_fee: Number(operatingFee) || 30000,
      ...(mode === 'create' ? { is_active: true } : {})
    }
    const url = mode === 'create' ? '/api/admin/quarters' : `/api/admin/quarters/${quarter!.id}`
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
        {mode === 'create' ? '새 분기 등록' : '분기 수정'}
      </div>
      <div>
        <Label htmlFor="q-name">분기 이름</Label>
        <Input
          id="q-name"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="예: 26-3"
          className="mt-1"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="q-start">시작일</Label>
          <Input
            id="q-start"
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="q-end">종료일</Label>
          <Input
            id="q-end"
            type="date"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="mt-1"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="q-deposit">초기 보증금 (원)</Label>
          <Input
            id="q-deposit"
            type="number"
            inputMode="numeric"
            value={deposit}
            onChange={e => setDeposit(e.target.value.replace(/\D/g, ''))}
            className="mt-1"
          />
          <p className="mt-1 text-xs text-gray-500">분기 시작 시 보증금</p>
        </div>
        <div>
          <Label htmlFor="q-opfee">분기 운영비 (원)</Label>
          <Input
            id="q-opfee"
            type="number"
            inputMode="numeric"
            value={operatingFee}
            onChange={e => setOperatingFee(e.target.value.replace(/\D/g, ''))}
            className="mt-1"
          />
          <p className="mt-1 text-xs text-gray-500">분기당 1인 각출액</p>
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2 pt-1">
        <Button onClick={submit} className="flex-1" disabled={pending}>
          {pending ? '저장 중...' : '저장'}
        </Button>
        <Button variant="secondary" onClick={onCancel} className="flex-1">
          취소
        </Button>
      </div>
    </div>
  )
}

/* ---------------- Bulk Session Form ---------------- */

function BulkSessionForm({
  quarterId,
  defaultStartNumber,
  onCancel,
  onDone
}: {
  quarterId: string
  defaultStartNumber: number
  onCancel: () => void
  onDone: () => void
}) {
  const [startDate, setStartDate] = useState('')
  const [count, setCount] = useState('7')
  const [interval, setInterval] = useState<'1' | '2'>('2')
  const [slots, setSlots] = useState('2')
  const [startNumber, setStartNumber] = useState(defaultStartNumber.toString())
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<{
    created_sessions: number
    created_slots: number
    errors: string[]
  } | null>(null)

  const submit = async () => {
    setError('')
    setResult(null)
    if (!startDate) {
      setError('시작 날짜를 선택해주세요.')
      return
    }
    const c = Number(count)
    if (!c || c < 1) {
      setError('회차 수는 1 이상이어야 합니다.')
      return
    }
    setPending(true)
    const r = await fetch('/api/admin/sessions/bulk', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        quarter_id: quarterId,
        start_date: startDate,
        count: c,
        interval_weeks: Number(interval),
        slots_per_session: Number(slots),
        start_session_number: Number(startNumber) || undefined
      })
    })
    setPending(false)
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      setError(j.error || '저장 실패')
      return
    }
    const j = await r.json()
    setResult({
      created_sessions: j.created_sessions,
      created_slots: j.created_slots,
      errors: j.errors ?? []
    })
    if ((j.errors ?? []).length === 0) {
      // 성공 시 즉시 닫지 않고 결과 표시 후 onDone 호출
      setTimeout(() => onDone(), 800)
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
      <div className="text-base font-bold text-gray-900">여러 회차 일괄 등록</div>
      <p className="text-xs text-gray-600">
        예: 시작 5/20 / 7회차 / 격주 / 슬롯 3개 → 5/20, 6/3, 6/17... 7회차가 각 슬롯 3개 빈 슬롯으로 생성됩니다.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="b-start">시작 날짜</Label>
          <Input
            id="b-start"
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="b-count">회차 수</Label>
          <Input
            id="b-count"
            type="number"
            inputMode="numeric"
            value={count}
            onChange={e => setCount(e.target.value.replace(/\D/g, ''))}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="b-interval">간격</Label>
          <select
            id="b-interval"
            value={interval}
            onChange={e => setInterval(e.target.value as '1' | '2')}
            className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm"
          >
            <option value="1">매주</option>
            <option value="2">격주</option>
          </select>
        </div>
        <div>
          <Label htmlFor="b-slots">슬롯 수 (회차당)</Label>
          <select
            id="b-slots"
            value={slots}
            onChange={e => setSlots(e.target.value)}
            className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-2 text-sm"
          >
            <option value="0">0 (발표 없음)</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
          </select>
        </div>
        <div className="col-span-2">
          <Label htmlFor="b-startnum">시작 회차 번호</Label>
          <Input
            id="b-startnum"
            type="number"
            inputMode="numeric"
            value={startNumber}
            onChange={e => setStartNumber(e.target.value.replace(/\D/g, ''))}
            className="mt-1"
          />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {result && (
        <div className="rounded-lg bg-white p-3 text-sm">
          <div className="font-semibold text-gray-900">
            {result.created_sessions}회차 / 슬롯 {result.created_slots}개 생성
          </div>
          {result.errors.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs text-red-700">
              {result.errors.map((er, i) => (
                <li key={i}>• {er}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="flex gap-2 pt-1">
        <Button onClick={submit} className="flex-1" disabled={pending}>
          {pending ? '생성 중...' : '일괄 생성'}
        </Button>
        <Button variant="secondary" onClick={onCancel} className="flex-1">
          닫기
        </Button>
      </div>
    </div>
  )
}
