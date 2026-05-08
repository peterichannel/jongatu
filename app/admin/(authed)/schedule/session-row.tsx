'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronUp, ClipboardCheck, Pencil, Plus, Trash2, X, Check, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { Member, Presentation, Session } from '@/lib/types'
import { SESSION_TYPE_LABEL, SessionForm } from './session-form'

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

function formatDateLine(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  if (!y) return d
  const dt = new Date(Date.UTC(y, m - 1, day))
  const wd = WEEKDAY[dt.getUTCDay()]
  return `${m}월 ${day}일 (${wd})`
}

export function SessionRow({
  session,
  presentations,
  members,
  onChanged
}: {
  session: Session
  presentations: Presentation[]
  members: Member[]
  onChanged: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [addingPresentation, setAddingPresentation] = useState(false)
  const [editingPresentationId, setEditingPresentationId] = useState<string | null>(null)

  const memberName = (id: string) => members.find(m => m.id === id)?.name ?? '(알수없음)'

  const nextSlot = useMemo(() => {
    const max = presentations.reduce((acc, p) => Math.max(acc, p.slot), 0)
    return max + 1
  }, [presentations])

  const handleDelete = async () => {
    if (!confirm(`${session.session_number}회차를 삭제하시겠습니까?\n관련 출결/평가 기록도 함께 삭제됩니다.`)) return
    const r = await fetch(`/api/admin/sessions/${session.id}`, { method: 'DELETE' })
    if (r.ok) onChanged()
    else alert('삭제 실패')
  }

  const isRest = session.type === 'rest'
  const isNormal = session.type === 'normal'

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      {editing ? (
        <div className="p-3">
          <SessionForm
            mode="edit"
            session={session}
            onCancel={() => setEditing(false)}
            onDone={() => {
              setEditing(false)
              onChanged()
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="flex w-full items-center gap-3 p-4 text-left"
        >
          <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-green-50 text-green-700">
            <span className="text-xs font-medium">{session.session_number}회</span>
          </div>
          <div className="flex-1">
            <div className="text-base font-bold text-gray-900">{formatDateLine(session.date)}</div>
            <div className="text-sm text-gray-500">
              {SESSION_TYPE_LABEL[session.type]}
              {session.note ? ` · ${session.note}` : ''}
              {isNormal && presentations.length > 0 && ` · 발표 ${presentations.length}건`}
            </div>
          </div>
          {expanded ? (
            <ChevronUp className="h-5 w-5 text-gray-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-gray-400" />
          )}
        </button>
      )}

      {expanded && !editing && (
        <div className="space-y-3 border-t border-gray-100 px-4 py-3">
          {/* 발표 섹션 - normal 타입에서만 노출 */}
          {isNormal && (
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                발표
              </div>

              {presentations.length === 0 && !addingPresentation && (
                <p className="text-sm text-gray-500">아직 등록된 발표가 없습니다.</p>
              )}

              <ul className="space-y-2">
                {presentations.map(p =>
                  editingPresentationId === p.id ? (
                    <li key={p.id}>
                      <PresentationForm
                        mode="edit"
                        presentation={p}
                        members={members}
                        sessionId={session.id}
                        onCancel={() => setEditingPresentationId(null)}
                        onDone={() => {
                          setEditingPresentationId(null)
                          onChanged()
                        }}
                      />
                    </li>
                  ) : (
                    <li
                      key={p.id}
                      className="flex items-start gap-2 rounded-lg border border-gray-200 p-3"
                    >
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-700">
                        {p.slot}
                      </div>
                      <div className="flex-1 text-sm">
                        <div className="font-semibold text-gray-900">
                          {p.special_label
                            ? p.special_label
                            : p.presenter_id
                              ? memberName(p.presenter_id)
                              : '🟢 빈 슬롯 (멤버 자율 예약)'}
                        </div>
                        {p.company_name && (
                          <div className="mt-0.5 text-gray-700">{p.company_name}</div>
                        )}
                        {p.cafe_url && (
                          <a
                            href={p.cafe_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-0.5 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                          >
                            카페 자료 <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingPresentationId(p.id)}
                        aria-label="발표 수정"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          if (!confirm(`발표 ${p.slot}번을 삭제하시겠습니까?`)) return
                          const r = await fetch(`/api/admin/presentations/${p.id}`, {
                            method: 'DELETE'
                          })
                          if (r.ok) onChanged()
                          else alert('삭제 실패')
                        }}
                        aria-label="발표 삭제"
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </li>
                  )
                )}
              </ul>

              {addingPresentation ? (
                <PresentationForm
                  mode="create"
                  sessionId={session.id}
                  defaultSlot={nextSlot}
                  members={members}
                  onCancel={() => setAddingPresentation(false)}
                  onDone={() => {
                    setAddingPresentation(false)
                    onChanged()
                  }}
                />
              ) : (
                <button
                  onClick={() => setAddingPresentation(true)}
                  className="w-full rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm text-gray-600 hover:border-gray-400"
                >
                  <Plus className="mr-1 inline h-4 w-4" />
                  발표 추가
                </button>
              )}
            </div>
          )}

          {isRest && (
            <p className="text-sm text-gray-500">휴강 회차는 출석/발표 처리 대상이 아닙니다.</p>
          )}

          {/* 출석체크 진입 (정상 회차만) */}
          {isNormal && (
            <Link
              href={`/admin/schedule/${session.id}/attendance`}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-3 text-base font-bold text-green-900 hover:bg-green-100"
            >
              <ClipboardCheck className="h-5 w-5" />
              출석체크
            </Link>
          )}

          {/* 회차 컨트롤 */}
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={() => setEditing(true)} className="flex-1">
              <Pencil className="h-4 w-4" />
              회차 수정
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDelete} className="text-red-600 hover:bg-red-50">
              <Trash2 className="h-4 w-4" />
              삭제
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ---------------- Presentation Form ---------------- */

function PresentationForm({
  mode,
  presentation,
  sessionId,
  defaultSlot,
  members,
  onCancel,
  onDone
}: {
  mode: 'create' | 'edit'
  presentation?: Presentation
  sessionId: string
  defaultSlot?: number
  members: Member[]
  onCancel: () => void
  onDone: () => void
}) {
  const [slot, setSlot] = useState<string>(
    (presentation?.slot ?? defaultSlot ?? 1).toString()
  )
  const [presenter, setPresenter] = useState(presentation?.presenter_id ?? '')
  const [companyName, setCompanyName] = useState(presentation?.company_name ?? '')
  const [cafeUrl, setCafeUrl] = useState(presentation?.cafe_url ?? '')
  const [specialLabel, setSpecialLabel] = useState(presentation?.special_label ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setError('')
    const slotNum = Number(slot)
    if (!slotNum || slotNum < 1) {
      setError('슬롯 번호를 입력하세요.')
      return
    }

    setPending(true)
    const body = {
      slot: slotNum,
      presenter_id: presenter || null,
      company_name: companyName,
      cafe_url: cafeUrl,
      special_label: specialLabel,
      ...(mode === 'create' ? { session_id: sessionId } : {})
    }
    const url =
      mode === 'create'
        ? '/api/admin/presentations'
        : `/api/admin/presentations/${presentation!.id}`
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

  const selectClass =
    'mt-1 h-14 w-full rounded-xl border border-gray-300 bg-white px-4 text-lg outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100'

  return (
    <div className="space-y-3 rounded-lg border border-green-200 bg-green-50 p-3">
      <div className="text-sm font-bold text-green-900">
        {mode === 'create' ? '발표 추가' : '발표 수정'}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-1">
          <Label htmlFor="p-slot">슬롯</Label>
          <Input
            id="p-slot"
            type="number"
            inputMode="numeric"
            value={slot}
            onChange={e => setSlot(e.target.value.replace(/\D/g, ''))}
            className="mt-1"
          />
        </div>
        <div className="col-span-2">
          <Label htmlFor="p-company">기업명 (선택)</Label>
          <Input
            id="p-company"
            value={companyName}
            onChange={e => setCompanyName(e.target.value)}
            placeholder="예: 삼성전자"
            className="mt-1"
          />
        </div>
      </div>
      <div>
        <Label htmlFor="p-presenter">발표자 (선택, 비워두면 멤버 자율 예약 슬롯)</Label>
        <select
          id="p-presenter"
          value={presenter}
          onChange={e => setPresenter(e.target.value)}
          className={selectClass}
        >
          <option value="">🟢 빈 슬롯 (멤버 자율 예약)</option>
          {members.map(m => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="p-special">특별 슬롯 라벨 (선택, 예: 포트폴리오 발표)</Label>
        <Input
          id="p-special"
          value={specialLabel}
          onChange={e => setSpecialLabel(e.target.value)}
          placeholder="비워두면 일반 발표"
          className="mt-1"
        />
      </div>
      <div>
        <Label htmlFor="p-cafe">카페 자료 URL (선택)</Label>
        <Input
          id="p-cafe"
          type="url"
          value={cafeUrl}
          onChange={e => setCafeUrl(e.target.value)}
          placeholder="https://cafe.naver.com/..."
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
