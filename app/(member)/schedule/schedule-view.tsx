'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  List,
  Loader2,
  PartyPopper,
  Pencil,
  Sparkles,
  X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Member, Presentation, Quarter, Session } from '@/lib/types'

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']
function formatDateKR(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  if (!y) return d
  const dt = new Date(Date.UTC(y, m - 1, day))
  return `${m}월 ${day}일 (${WEEKDAY[dt.getUTCDay()]})`
}

function todayISOInSeoul() {
  const now = new Date()
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000
  const seoul = new Date(utcMs + 9 * 3600_000)
  const yyyy = seoul.getFullYear()
  const mm = String(seoul.getMonth() + 1).padStart(2, '0')
  const dd = String(seoul.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

const EVENT_TYPE_LABEL: Record<Session['type'], string> = {
  normal: '발표',
  rest: '휴식',
  dinner: '회식',
  social: '친목',
  event: '특별 일정'
}

type ToastKind = 'success' | 'error' | 'info'
type ViewMode = 'list' | 'calendar'

export function ScheduleView({
  me,
  quarters,
  targetQuarter,
  sessions,
  presentations,
  members
}: {
  me: Member
  quarters: Quarter[]
  targetQuarter: Quarter
  sessions: Session[]
  presentations: Presentation[]
  members: Member[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [view, setView] = useState<ViewMode>('list')
  const [toast, setToast] = useState<{ kind: ToastKind; text: string } | null>(null)
  const [transferTarget, setTransferTarget] = useState<{
    presentation: Presentation
    sessionLabel: string
    currentLabel: string
  } | null>(null)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [showPast, setShowPast] = useState(false)

  const today = todayISOInSeoul()
  const { pastSessions, upcomingSessions } = useMemo(() => {
    const past: Session[] = []
    const upcoming: Session[] = []
    for (const s of sessions) {
      if (s.date < today) past.push(s)
      else upcoming.push(s)
    }
    return { pastSessions: past, upcomingSessions: upcoming }
  }, [sessions, today])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 5000)
    return () => clearTimeout(t)
  }, [toast])

  const memberName = (id: string | null | undefined) =>
    id ? members.find(m => m.id === id)?.name ?? '(이전 멤버)' : ''

  const presBySession = useMemo(() => {
    const m = new Map<string, Presentation[]>()
    for (const p of presentations) {
      const arr = m.get(p.session_id) ?? []
      arr.push(p)
      m.set(p.session_id, arr)
    }
    return m
  }, [presentations])

  const sessionsByDate = useMemo(() => {
    const m = new Map<string, Session>()
    for (const s of sessions) m.set(s.date, s)
    return m
  }, [sessions])

  const myReservation = useMemo(
    () => presentations.find(p => p.presenter_id === me.id) ?? null,
    [presentations, me.id]
  )

  const myReservationSession = myReservation
    ? sessions.find(s => s.id === myReservation.session_id)
    : null

  const isActiveQuarter = targetQuarter.is_active
  const showToast = (kind: ToastKind, text: string) => setToast({ kind, text })
  const refresh = () => startTransition(() => router.refresh())

  const onQuarterChange = (id: string) => {
    const params = new URLSearchParams(searchParams)
    params.set('quarter', id)
    router.push(`/schedule?${params.toString()}`)
  }

  const handleReserveClick = (p: Presentation, session: Session) => {
    const sessionLabel = `${session.session_number}회차 슬롯 ${p.slot}`
    if (myReservation && myReservation.id !== p.id && myReservationSession) {
      const currentLabel = `${myReservationSession.session_number}회차 슬롯 ${myReservation.slot}${myReservation.company_name ? ` (${myReservation.company_name})` : ''}`
      setTransferTarget({ presentation: p, sessionLabel, currentLabel })
      return
    }
    void doReserve(p)
  }

  const doReserve = async (p: Presentation) => {
    const r = await fetch('/api/reservations/reserve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ presentation_id: p.id })
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) {
      showToast('error', j.error || '예약 실패')
      return
    }
    showToast('success', j.transferred ? '슬롯을 이동했습니다.' : '예약 완료!')
    refresh()
  }

  const doCancel = async (p: Presentation) => {
    if (!confirm('예약을 취소하시겠습니까?')) return
    const r = await fetch('/api/reservations/cancel', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ presentation_id: p.id })
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) {
      showToast('error', j.error || '취소 실패')
      return
    }
    showToast('success', '예약이 취소됐습니다.')
    refresh()
  }

  const doUpdateCompany = async (p: Presentation, name: string) => {
    const r = await fetch('/api/reservations/company', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ presentation_id: p.id, company_name: name })
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) {
      showToast('error', j.error || '저장 실패')
      return false
    }
    showToast('success', '종목명이 저장됐습니다.')
    refresh()
    return true
  }

  const renderSlot = (p: Presentation) => (
    <SlotCard
      key={p.id}
      presentation={p}
      isMine={p.presenter_id === me.id}
      presenterName={memberName(p.presenter_id)}
      isActiveQuarter={isActiveQuarter}
      onReserve={() => {
        const s = sessions.find(s => s.id === p.session_id)
        if (s) handleReserveClick(p, s)
      }}
      onCancel={() => doCancel(p)}
      onUpdateCompany={name => doUpdateCompany(p, name)}
    />
  )

  const renderSessionBlock = (session: Session) => {
    const slots = presBySession.get(session.id) ?? []
    return (
      <section
        key={session.id}
        id={`session-${session.id}`}
        className="overflow-hidden rounded-2xl border border-gray-200 bg-white"
      >
        <div className="flex items-baseline justify-between border-b border-gray-100 bg-gray-50 px-4 py-3">
          <div>
            <div className="text-xs text-gray-500">{session.session_number}회차</div>
            <div className="text-base font-bold text-gray-900">
              {formatDateKR(session.date)}
            </div>
          </div>
          <div className="text-xs font-semibold text-gray-600">
            {EVENT_TYPE_LABEL[session.type]}
          </div>
        </div>
        {session.type !== 'normal' ? (
          <div className="flex items-center gap-2 px-4 py-4 text-sm text-gray-600">
            <PartyPopper className="h-4 w-4 text-pink-500" />
            {session.note || EVENT_TYPE_LABEL[session.type]} (예약 대상 아님)
          </div>
        ) : slots.length === 0 ? (
          <div className="px-4 py-4 text-sm text-gray-500">
            아직 슬롯이 등록되지 않았습니다.
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {slots.map(p => (
              <li key={p.id}>{renderSlot(p)}</li>
            ))}
          </ul>
        )}
      </section>
    )
  }

  const selectedSession = selectedSessionId
    ? sessions.find(s => s.id === selectedSessionId) ?? null
    : null

  return (
    <div className="space-y-5">
      {toast && <Toast kind={toast.kind} text={toast.text} onClose={() => setToast(null)} />}

      {/* 분기 선택 */}
      <section className="rounded-2xl border border-gray-200 bg-white p-4">
        <label htmlFor="quarter-select" className="text-xs font-bold text-gray-600">
          분기
        </label>
        <select
          id="quarter-select"
          value={targetQuarter.id}
          onChange={e => onQuarterChange(e.target.value)}
          className="mt-1 h-12 w-full rounded-xl border border-gray-300 bg-white px-3 text-base outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
        >
          {quarters.map(q => (
            <option key={q.id} value={q.id}>
              {q.name}
              {q.is_active ? ' (활성)' : ''}
            </option>
          ))}
        </select>
        {!isActiveQuarter && (
          <p className="mt-2 text-xs text-amber-700">
            * 활성 분기가 아닙니다. 예약은 활성 분기에서만 가능합니다.
          </p>
        )}
      </section>

      {/* 내 예약 요약 */}
      {myReservation && myReservationSession && isActiveQuarter && (
        <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-amber-900">
            <Sparkles className="h-4 w-4" />
            내 예약
          </div>
          <div className="mt-2 text-lg font-bold text-amber-900">
            {formatDateKR(myReservationSession.date)} ·{' '}
            {myReservationSession.session_number}회차 · 슬롯 {myReservation.slot}
          </div>
          {myReservation.company_name && (
            <div className="text-base text-amber-800">{myReservation.company_name}</div>
          )}
        </section>
      )}

      {/* 뷰 토글 */}
      <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1">
        <ViewToggle active={view === 'list'} onClick={() => setView('list')}>
          <List className="h-4 w-4" /> 리스트
        </ViewToggle>
        <ViewToggle active={view === 'calendar'} onClick={() => setView('calendar')}>
          <CalendarDays className="h-4 w-4" /> 캘린더
        </ViewToggle>
      </div>

      {view === 'list' ? (
        <div className="space-y-4">
          {sessions.length === 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
              이 분기에 등록된 회차가 없습니다.
            </div>
          ) : (
            <>
              {/* 다가오는 회차 (오늘 포함) */}
              {upcomingSessions.length > 0 ? (
                upcomingSessions.map(s => renderSessionBlock(s))
              ) : (
                <div className="rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-600">
                  남은 회차가 없습니다. 다음 분기를 확인해주세요.
                </div>
              )}

              {/* 지난 회차 — 아코디언으로 접기 */}
              {pastSessions.length > 0 && (
                <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
                  <button
                    type="button"
                    onClick={() => setShowPast(v => !v)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-gray-50"
                    aria-expanded={showPast}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-700">지난 회차</span>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                        {pastSessions.length}건
                      </span>
                    </div>
                    <ChevronDown
                      className={cn(
                        'h-5 w-5 text-gray-500 transition-transform',
                        showPast && 'rotate-180'
                      )}
                    />
                  </button>
                  {showPast && (
                    <div className="space-y-4 border-t border-gray-100 bg-gray-50 p-4">
                      {pastSessions.map(s => renderSessionBlock(s))}
                    </div>
                  )}
                </section>
              )}
            </>
          )}
        </div>
      ) : (
        <CalendarView
          sessions={sessions}
          sessionsByDate={sessionsByDate}
          presBySession={presBySession}
          meId={me.id}
          today={today}
          onSelectSession={id => setSelectedSessionId(id)}
        />
      )}

      {/* 캘린더에서 선택한 회차 상세 시트 */}
      {selectedSession && (
        <BottomSheet onClose={() => setSelectedSessionId(null)}>
          <div className="border-b border-gray-100 px-1 pb-3">
            <div className="text-xs text-gray-500">{selectedSession.session_number}회차</div>
            <div className="text-lg font-bold text-gray-900">
              {formatDateKR(selectedSession.date)}
            </div>
            <div className="mt-0.5 text-xs text-gray-600">
              {EVENT_TYPE_LABEL[selectedSession.type]}
            </div>
          </div>
          {selectedSession.type !== 'normal' ? (
            <div className="flex items-center gap-2 px-1 py-4 text-sm text-gray-600">
              <PartyPopper className="h-4 w-4 text-pink-500" />
              {selectedSession.note || EVENT_TYPE_LABEL[selectedSession.type]} (예약 대상 아님)
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {(presBySession.get(selectedSession.id) ?? []).length === 0 ? (
                <li className="px-1 py-4 text-sm text-gray-500">
                  아직 슬롯이 등록되지 않았습니다.
                </li>
              ) : (
                (presBySession.get(selectedSession.id) ?? []).map(p => (
                  <li key={p.id}>{renderSlot(p)}</li>
                ))
              )}
            </ul>
          )}
        </BottomSheet>
      )}

      {/* 이동 확인 모달 */}
      {transferTarget && (
        <ConfirmModal
          title="슬롯을 이동할까요?"
          message={`현재 ${transferTarget.currentLabel} 예약을 취소하고 ${transferTarget.sessionLabel}로 이동합니다.`}
          cancelLabel="이전"
          confirmLabel="이동"
          onCancel={() => setTransferTarget(null)}
          onConfirm={() => {
            const p = transferTarget.presentation
            setTransferTarget(null)
            void doReserve(p)
          }}
        />
      )}

      {isPending && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/10">
          <div className="rounded-full bg-white p-3 shadow">
            <Loader2 className="h-6 w-6 animate-spin text-green-600" />
          </div>
        </div>
      )}
    </div>
  )
}

/* ─────────────── 캘린더 뷰 ─────────────── */

type CellSummary = {
  session: Session
  count_total: number
  count_empty: number
  count_mine: number
  count_others: number
  is_event: boolean
}

function summarizeSession(
  session: Session,
  presentations: Presentation[],
  meId: string
): CellSummary {
  if (session.type !== 'normal') {
    return {
      session,
      count_total: 0,
      count_empty: 0,
      count_mine: 0,
      count_others: 0,
      is_event: true
    }
  }
  let mine = 0
  let empty = 0
  let others = 0
  for (const p of presentations) {
    if (p.special_label) continue
    if (p.presenter_id === meId) mine += 1
    else if (!p.presenter_id) empty += 1
    else others += 1
  }
  return {
    session,
    count_total: presentations.length,
    count_empty: empty,
    count_mine: mine,
    count_others: others,
    is_event: false
  }
}

function CalendarView({
  sessions,
  sessionsByDate,
  presBySession,
  meId,
  today,
  onSelectSession
}: {
  sessions: Session[]
  sessionsByDate: Map<string, Session>
  presBySession: Map<string, Presentation[]>
  meId: string
  today: string
  onSelectSession: (sessionId: string) => void
}) {
  // 분기 내 첫/마지막 회차 월 범위
  const monthRange = useMemo(() => {
    if (sessions.length === 0) {
      const now = new Date()
      return {
        min: { year: now.getFullYear(), month: now.getMonth() },
        max: { year: now.getFullYear(), month: now.getMonth() }
      }
    }
    const dates = sessions.map(s => s.date.split('-').map(Number) as [number, number, number])
    let minY = dates[0][0],
      minM = dates[0][1],
      maxY = dates[0][0],
      maxM = dates[0][1]
    for (const [y, m] of dates) {
      if (y < minY || (y === minY && m < minM)) {
        minY = y
        minM = m
      }
      if (y > maxY || (y === maxY && m > maxM)) {
        maxY = y
        maxM = m
      }
    }
    return {
      min: { year: minY, month: minM - 1 },
      max: { year: maxY, month: maxM - 1 }
    }
  }, [sessions])

  // 오늘이 분기 범위 안에 들어오면 오늘 달부터, 아니면 분기 첫 달
  const initialCal = useMemo(() => {
    const [ty, tm] = today.split('-').map(Number)
    const todayCal = { year: ty, month: tm - 1 }
    const beforeMin =
      todayCal.year < monthRange.min.year ||
      (todayCal.year === monthRange.min.year && todayCal.month < monthRange.min.month)
    const afterMax =
      todayCal.year > monthRange.max.year ||
      (todayCal.year === monthRange.max.year && todayCal.month > monthRange.max.month)
    if (beforeMin) return monthRange.min
    if (afterMax) return monthRange.max
    return todayCal
  }, [today, monthRange])

  const [cal, setCal] = useState<{ year: number; month: number }>(initialCal)

  const canPrev =
    cal.year > monthRange.min.year ||
    (cal.year === monthRange.min.year && cal.month > monthRange.min.month)
  const canNext =
    cal.year < monthRange.max.year ||
    (cal.year === monthRange.max.year && cal.month < monthRange.max.month)

  const cells = useMemo(() => {
    const first = new Date(Date.UTC(cal.year, cal.month, 1))
    const startWeekday = first.getUTCDay()
    const daysInMonth = new Date(Date.UTC(cal.year, cal.month + 1, 0)).getUTCDate()
    const out: { date: string | null; day: number | null }[] = []
    for (let i = 0; i < startWeekday; i++) out.push({ date: null, day: null })
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${cal.year}-${String(cal.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      out.push({ date: iso, day: d })
    }
    while (out.length < 42) out.push({ date: null, day: null })
    return out
  }, [cal])

  const monthLabel = `${cal.year}년 ${cal.month + 1}월`

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            if (!canPrev) return
            const m = cal.month === 0 ? 11 : cal.month - 1
            const y = cal.month === 0 ? cal.year - 1 : cal.year
            setCal({ year: y, month: m })
          }}
          disabled={!canPrev}
          className="rounded-lg p-2 text-gray-700 hover:bg-gray-100 disabled:opacity-30"
          aria-label="이전 달"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="text-base font-bold text-gray-900">{monthLabel}</div>
        <button
          type="button"
          onClick={() => {
            if (!canNext) return
            const m = cal.month === 11 ? 0 : cal.month + 1
            const y = cal.month === 11 ? cal.year + 1 : cal.year
            setCal({ year: y, month: m })
          }}
          disabled={!canNext}
          className="rounded-lg p-2 text-gray-700 hover:bg-gray-100 disabled:opacity-30"
          aria-label="다음 달"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {WEEKDAY.map((w, i) => (
          <div
            key={w}
            className={cn(
              'py-1.5 text-xs font-bold',
              i === 0 && 'text-red-500',
              i === 6 && 'text-blue-500',
              i > 0 && i < 6 && 'text-gray-600'
            )}
          >
            {w}
          </div>
        ))}
        {cells.map((c, idx) => {
          if (!c.date) {
            return <div key={idx} className="aspect-square" />
          }
          const session = sessionsByDate.get(c.date)
          const summary = session
            ? summarizeSession(session, presBySession.get(session.id) ?? [], meId)
            : null
          const weekdayIdx = idx % 7
          const isToday = c.date === today
          return (
            <button
              key={idx}
              type="button"
              onClick={() => session && onSelectSession(session.id)}
              disabled={!session}
              className={cn(
                'flex aspect-square flex-col items-center justify-start gap-1 rounded-lg border p-1 text-[11px] transition',
                session
                  ? 'border-gray-200 bg-white hover:border-green-400'
                  : 'border-transparent text-gray-400',
                isToday && 'ring-2 ring-amber-400 ring-offset-1'
              )}
            >
              <span
                className={cn(
                  'text-sm font-semibold',
                  weekdayIdx === 0 && session && 'text-red-500',
                  weekdayIdx === 6 && session && 'text-blue-500',
                  !session && weekdayIdx === 0 && 'text-red-300',
                  !session && weekdayIdx === 6 && 'text-blue-300',
                  isToday && 'text-amber-700'
                )}
              >
                {c.day}
              </span>
              {summary && <CalendarBadge summary={summary} />}
            </button>
          )
        })}
      </div>

      <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs text-gray-600">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-sm ring-2 ring-amber-400" />
            오늘
          </span>
          <span>🟢 빈 슬롯</span>
          <span>⭐ 내 발표</span>
          <span>👤 타인 예약</span>
          <span>🎉 특별 일정</span>
        </div>
      </div>
    </div>
  )
}

function CalendarBadge({ summary }: { summary: CellSummary }) {
  if (summary.is_event) {
    return <span className="text-base leading-none">🎉</span>
  }
  if (summary.count_mine > 0) {
    return <span className="text-base leading-none">⭐</span>
  }
  if (summary.count_empty > 0) {
    return (
      <span className="rounded-full bg-green-100 px-1.5 text-[10px] font-bold text-green-800">
        🟢 {summary.count_empty}
      </span>
    )
  }
  if (summary.count_others > 0) {
    return (
      <span className="rounded-full bg-gray-100 px-1.5 text-[10px] font-semibold text-gray-700">
        👤 {summary.count_others}
      </span>
    )
  }
  return null
}

/* ─────────────── 슬롯 카드 ─────────────── */

function SlotCard({
  presentation,
  isMine,
  presenterName,
  isActiveQuarter,
  onReserve,
  onCancel,
  onUpdateCompany
}: {
  presentation: Presentation
  isMine: boolean
  presenterName: string
  isActiveQuarter: boolean
  onReserve: () => void
  onCancel: () => void
  onUpdateCompany: (name: string) => Promise<boolean>
}) {
  const isSpecial = !!presentation.special_label
  const isEmpty = !presentation.presenter_id && !isSpecial

  if (isSpecial) {
    return (
      <div className="bg-pink-50/40 px-4 py-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-pink-900">
          <PartyPopper className="h-4 w-4" />
          슬롯 {presentation.slot} · {presentation.special_label}
        </div>
      </div>
    )
  }

  if (isMine) {
    return (
      <div className="bg-amber-50 px-4 py-4">
        <div className="flex items-center gap-2 text-base font-bold text-amber-900">
          <Sparkles className="h-5 w-5 text-amber-600" />
          슬롯 {presentation.slot} · 내 발표
        </div>
        {presentation.reserved_at && (
          <div className="mt-0.5 text-xs text-amber-700">
            예약일: {presentation.reserved_at.slice(0, 10)}
          </div>
        )}
        <CompanyEditor
          initial={presentation.company_name ?? ''}
          onSave={onUpdateCompany}
        />
        <button
          type="button"
          onClick={onCancel}
          className="mt-3 inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-red-700 hover:border-red-400"
        >
          <X className="h-4 w-4" /> 예약 취소
        </button>
      </div>
    )
  }

  if (isEmpty) {
    return (
      <div className="bg-white px-4 py-4">
        <div className="text-sm font-semibold text-gray-700">슬롯 {presentation.slot}</div>
        <div className="mt-0.5 text-base font-bold text-green-700">🟢 빈 슬롯</div>
        {isActiveQuarter ? (
          <Button
            type="button"
            onClick={onReserve}
            className="mt-3 h-14 w-full bg-green-600 text-base hover:bg-green-700"
          >
            <ArrowRight className="h-5 w-5" /> 예약하기
          </Button>
        ) : (
          <p className="mt-2 text-xs text-gray-500">활성 분기에서만 예약 가능합니다.</p>
        )}
      </div>
    )
  }

  // 다른 사람 예약
  return (
    <div className="bg-gray-50 px-4 py-4 opacity-90">
      <div className="text-sm font-semibold text-gray-600">슬롯 {presentation.slot}</div>
      <div className="mt-0.5 text-base font-semibold text-gray-800">
        👤 {presenterName}
        {presentation.company_name ? ` · ${presentation.company_name}` : ''}
      </div>
      <div className="mt-1 text-xs text-gray-500">다른 분이 예약하셨습니다 (변경 불가)</div>
    </div>
  )
}

/* ─────────────── 종목 입력/수정 ─────────────── */

function CompanyEditor({
  initial,
  onSave
}: {
  initial: string
  onSave: (name: string) => Promise<boolean>
}) {
  const [editing, setEditing] = useState(initial.trim().length === 0)
  const [value, setValue] = useState(initial)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    setValue(initial)
    setEditing(initial.trim().length === 0)
  }, [initial])

  const submit = async () => {
    setPending(true)
    const ok = await onSave(value.trim())
    setPending(false)
    if (ok) setEditing(false)
  }

  if (!editing) {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-lg bg-white px-3 py-2">
        <span className="flex-1 text-base font-semibold text-amber-900">
          종목: {value || '(미입력)'}
        </span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="종목 수정"
          className="inline-flex items-center gap-1 text-sm font-semibold text-amber-700 hover:text-amber-900"
        >
          <Pencil className="h-4 w-4" /> 수정
        </button>
      </div>
    )
  }

  return (
    <div className="mt-2 space-y-2">
      <Input
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="발표 종목 입력 (예: 삼성전자)"
        className="h-12 text-base"
      />
      <div className="flex gap-2">
        <Button
          type="button"
          onClick={submit}
          disabled={pending}
          className="h-12 flex-1 bg-amber-600 hover:bg-amber-700"
        >
          {pending ? '저장 중...' : '저장'}
        </Button>
        {initial.trim() && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setValue(initial)
              setEditing(false)
            }}
            className="h-12 flex-1"
          >
            취소
          </Button>
        )}
      </div>
    </div>
  )
}

/* ─────────────── 토스트 / 모달 / 시트 / 토글 ─────────────── */

function ViewToggle({
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
      className={cn(
        'inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold transition',
        active ? 'bg-gray-900 text-white' : 'text-gray-600 hover:text-gray-900'
      )}
    >
      {children}
    </button>
  )
}

function ConfirmModal({
  title,
  message,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm
}: {
  title: string
  message: string
  cancelLabel: string
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-gray-900">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-700">{message}</p>
        <div className="mt-5 flex gap-3">
          <Button variant="outline" onClick={onCancel} className="h-14 flex-1">
            {cancelLabel}
          </Button>
          <Button onClick={onConfirm} className="h-14 flex-1 bg-green-600 hover:bg-green-700">
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}

function BottomSheet({
  children,
  onClose
}: {
  children: React.ReactNode
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="h-1 w-10 rounded-full bg-gray-300" aria-hidden />
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded-lg p-1 text-gray-500 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Toast({
  kind,
  text,
  onClose
}: {
  kind: ToastKind
  text: string
  onClose: () => void
}) {
  return (
    <div
      role="alert"
      className={cn(
        'fixed inset-x-0 top-4 z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl px-4 py-3 shadow-lg',
        kind === 'success' && 'border border-green-200 bg-green-50 text-green-900',
        kind === 'error' && 'border border-red-200 bg-red-50 text-red-900',
        kind === 'info' && 'border border-gray-200 bg-white text-gray-900'
      )}
    >
      {kind === 'success' && <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" />}
      {kind === 'error' && <X className="h-5 w-5 shrink-0 text-red-600" />}
      <span className="flex-1 text-base font-semibold">{text}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="닫기"
        className="text-gray-500 hover:text-gray-900"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
