'use client'

import { useEffect, useState } from 'react'
import { CalendarCheck, CheckCircle2, Clock, Pencil, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import type { Member, Presentation, Session } from '@/lib/types'
import {
  PRE_ATTENDANCE_CUTOFF_MINUTES,
  formatMinutesKR,
  isPreAttendanceOpen
} from '@/lib/seoul-time'
import { CheckInButton } from '../check-in-button'

const REASON_MAX = 100
// 빠른 선택 사유 — 눌러서 채우고, 그대로 두거나 뒤에 덧붙여 쓸 수 있다.
const QUICK_REASONS = ['회사 일정', '가족 일정', '몸이 안 좋음', '출장/여행'] as const

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

function formatDateKR(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  if (!y) return d
  const dt = new Date(Date.UTC(y, m - 1, day))
  return `${m}월 ${day}일 (${WEEKDAY[dt.getUTCDay()]})`
}

function formatLateThreshold(minutes: number | null) {
  const m = typeof minutes === 'number' && minutes >= 0 ? minutes : 19 * 60 + 20
  const hh = Math.floor(m / 60)
  const mm = m % 60
  return `${hh}시 ${String(mm).padStart(2, '0')}분`
}

type AttendanceRow = {
  id: string
  session_id: string
  member_id: string
  status: 'present' | 'late' | 'absent' | 'excused'
  checked_in_at: string | null
  is_confirmed: boolean
}

type PreAttendanceRow = {
  id: string
  session_id: string
  member_id: string
  status: 'attending' | 'absent'
  reason: string | null
  responded_at: string
}

export function AttendanceResponse({
  me,
  members,
  todaySession,
  todayPresentations,
  myAttendanceToday,
  myPreToday,
  futureSession,
  futurePresentations,
  myPreFuture
}: {
  me: Member
  members: Member[]
  todaySession: Session | null
  todayPresentations: Presentation[]
  myAttendanceToday: AttendanceRow | null
  myPreToday: PreAttendanceRow | null
  futureSession: Session | null
  futurePresentations: Presentation[]
  myPreFuture: PreAttendanceRow | null
}) {
  return (
    <div className="space-y-5">
      {/* 오늘 회차: 자가 체크인 + 사전참석 응답 통합 카드 */}
      {todaySession && (
        <SessionPanel
          kind="today"
          session={todaySession}
          presentations={todayPresentations}
          members={members}
          me={me}
          myPre={myPreToday}
          myAttendance={myAttendanceToday}
        />
      )}

      {/* 다음(미래) 회차: 사전참석 응답만 */}
      {futureSession && (
        <SessionPanel
          kind="future"
          session={futureSession}
          presentations={futurePresentations}
          members={members}
          me={me}
          myPre={myPreFuture}
          myAttendance={null}
        />
      )}
    </div>
  )
}

/* ─────────────── Session Panel ─────────────── */

function SessionPanel({
  kind,
  session,
  presentations,
  members,
  me,
  myPre,
  myAttendance
}: {
  kind: 'today' | 'future'
  session: Session
  presentations: Presentation[]
  members: Member[]
  me: Member
  myPre: PreAttendanceRow | null
  myAttendance: AttendanceRow | null
}) {
  const isPresenter = presentations.some(p => p.presenter_id === me.id)
  const memberName = (id: string) => members.find(m => m.id === id)?.name ?? '(알수없음)'
  const isToday = kind === 'today'
  const headerLabel = isToday ? '오늘 스터디' : '다음 스터디'
  const headerColor = isToday
    ? 'bg-amber-50 border-2 border-amber-300'
    : 'bg-green-50'
  const labelColor = isToday ? 'text-amber-900' : 'text-green-900'
  const subLabelColor = isToday ? 'text-amber-700' : 'text-green-700'

  return (
    <section className={`rounded-2xl p-5 ${headerColor}`}>
      <div className={`flex items-center gap-2 text-xs font-bold ${subLabelColor}`}>
        {isToday ? <CalendarCheck className="h-4 w-4" /> : null}
        <span>{headerLabel}</span>
        {session.is_test && (
          <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-800">
            🧪 테스트
          </span>
        )}
      </div>
      <div className={`mt-1 text-2xl font-bold ${labelColor}`}>
        {formatDateKR(session.date)}
      </div>
      <div className={`mt-1 text-sm ${labelColor}`}>{session.session_number}회차</div>
      {isPresenter && (
        <div className="mt-3 inline-block rounded-full bg-amber-200 px-3 py-1 text-sm font-semibold text-amber-900">
          ⭐ 발표 예정
        </div>
      )}

      {/* 오늘 회차: 자가 체크인 영역 (강조) */}
      {isToday && (
        <div className="mt-4 rounded-xl bg-white p-4">
          <div className="text-xs font-bold text-gray-700">출석 체크</div>
          {myAttendance ? (
            <>
              <CheckedInStatus row={myAttendance} />
              {!myAttendance.is_confirmed && (
                <div className="mt-2">
                  <ReCheckIn sessionId={session.id} />
                </div>
              )}
            </>
          ) : (
            <div className="mt-2">
              <CheckInButton sessionId={session.id} />
              <p className="mt-2 text-xs text-gray-600">
                도착하시면 위 버튼을 눌러주세요.{' '}
                {formatLateThreshold(session.late_after_minutes)} 이후 = 지각.
              </p>
              {myPre?.status === 'absent' && (
                <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                  사전참석에서 <b>불참</b>으로 응답하셨지만, 출석 체크 시{' '}
                  <b>출석/지각</b>으로 기록되며 결석 페널티는 부과되지 않습니다.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* 사전참석 응답 영역 */}
      <PreAttendanceArea
        session={session}
        myPre={myPre}
        compact={isToday && !!myPre}
      />

      {/* 발표 정보 */}
      {presentations.length > 0 && (
        <div
          className={`mt-4 space-y-1.5 border-t pt-3 text-sm ${
            isToday ? 'border-amber-200 text-amber-900' : 'border-green-200 text-green-900'
          }`}
        >
          <div className={`text-xs font-semibold uppercase tracking-wide ${subLabelColor}`}>
            발표 ({presentations.length}건)
          </div>
          {presentations.map(p => (
            <div key={p.id}>
              <span className="font-semibold">{p.slot}.</span>{' '}
              {p.special_label
                ? p.special_label
                : p.presenter_id
                  ? memberName(p.presenter_id)
                  : '🟢 빈 슬롯'}
              {p.company_name ? ` — ${p.company_name}` : ''}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

/* ─────────────── 출석 체크 다시하기 ─────────────── */

// 잘못 눌렀거나 시각이 틀어졌을 때 다시 체크 — POST 가 기존 행을 갱신하므로 재호출로 충분하다.
// 체크 자체를 무르는 '취소'는 미체크=결석 이 되어버려 제공하지 않는다(운영자만 정정).
function ReCheckIn({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const recheck = async () => {
    setError('')
    setPending(true)
    const r = await fetch('/api/attendance/check-in', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    })
    setPending(false)
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      setError(j.error || '다시 체크 실패')
      return
    }
    window.location.reload()
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-semibold text-gray-500 underline hover:text-gray-800"
      >
        체크 시각이 잘못됐나요?
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
      <p className="text-sm text-gray-700">
        지금 시각으로 다시 체크합니다. 출석/지각은 현재 시각 기준으로 다시 판정됩니다.
      </p>
      {error && <p className="mt-2 text-sm font-semibold text-red-600">{error}</p>}
      <div className="mt-2 flex gap-2">
        <Button onClick={recheck} disabled={pending} className="flex-1">
          {pending ? '처리 중...' : '다시 체크'}
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)} className="flex-1">
          닫기
        </Button>
      </div>
    </div>
  )
}

/* ─────────────── 출석 체크 결과 ─────────────── */

function CheckedInStatus({ row }: { row: AttendanceRow }) {
  const time = row.checked_in_at
    ? new Date(row.checked_in_at).toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Seoul'
      })
    : '-'
  if (row.status === 'late') {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-lg bg-amber-50 p-3">
        <Clock className="h-5 w-5 text-amber-600" />
        <span className="text-base font-bold text-amber-900">{time} 체크 — 지각</span>
      </div>
    )
  }
  if (row.status === 'present') {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-lg bg-green-50 p-3">
        <CheckCircle2 className="h-5 w-5 text-green-600" />
        <span className="text-base font-bold text-green-900">{time} 체크 — 출석</span>
      </div>
    )
  }
  if (row.status === 'absent') {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-lg bg-red-50 p-3">
        <XCircle className="h-5 w-5 text-red-600" />
        <span className="text-base font-bold text-red-900">결석 처리</span>
      </div>
    )
  }
  return (
    <div className="mt-2 rounded-lg bg-gray-50 p-3 text-sm text-gray-700">공결 처리</div>
  )
}

/* ─────────────── 사전참석 응답 ─────────────── */

function PreAttendanceArea({
  session,
  myPre,
  compact
}: {
  session: Session
  myPre: PreAttendanceRow | null
  compact: boolean
}) {
  const [pre, setPre] = useState<PreAttendanceRow | null>(myPre)
  const [editing, setEditing] = useState(!myPre)
  const [status, setStatus] = useState<'attending' | 'absent'>(myPre?.status ?? 'attending')
  const [reason, setReason] = useState(myPre?.reason ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  // 마감(회차 당일 18:50 KST) 판정은 마운트 후에만 — SSR 시각과 어긋나 hydration 이 깨지지 않도록
  // 초기값을 열림으로 두고, 마운트 직후·30초마다 다시 계산한다.
  const [open, setOpen] = useState(true)
  useEffect(() => {
    const tick = () => setOpen(isPreAttendanceOpen(session.date))
    tick()
    const timer = setInterval(tick, 30_000)
    return () => clearInterval(timer)
  }, [session.date])

  useEffect(() => {
    setPre(myPre)
    setEditing(!myPre)
    setStatus(myPre?.status ?? 'attending')
    setReason(myPre?.reason ?? '')
  }, [myPre])

  const submit = async () => {
    setError('')
    if (status === 'absent' && !reason.trim()) {
      setError('불참 사유를 입력해주세요.')
      return
    }
    setPending(true)
    const r = await fetch('/api/pre-attendance', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        session_id: session.id,
        status,
        reason: status === 'absent' ? reason : null
      })
    })
    setPending(false)
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      setError(j.error || '저장 실패')
      return
    }
    setPre({
      id: pre?.id ?? 'temp',
      session_id: session.id,
      member_id: pre?.member_id ?? '',
      status,
      reason: status === 'absent' ? reason : null,
      responded_at: new Date().toISOString()
    })
    setEditing(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 5000)
  }

  const deadlineText = `${formatMinutesKR(PRE_ATTENDANCE_CUTOFF_MINUTES)} (스터디 10분 전)`
  const savedBanner = saved ? (
    <div className="mt-3 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-900">
      ✓ 사전참석 답변 저장되었습니다
    </div>
  ) : null

  // 응답 완료 + compact: 한 줄 요약
  if (pre && !editing && compact) {
    return (
      <>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-white px-3 py-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-xs text-gray-500">사전참석</span>
            {pre.status === 'attending' ? (
              <span className="font-semibold text-green-800">✓ 참석</span>
            ) : (
              <span className="font-semibold text-red-800">
                ✗ 불참 {pre.reason ? `(${pre.reason})` : ''}
              </span>
            )}
          </div>
          {open ? (
            <button
              type="button"
              onClick={() => {
                setEditing(true)
                setError('')
              }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900"
            >
              <Pencil className="h-3 w-3" /> 변경
            </button>
          ) : (
            <span className="text-xs text-gray-400">답변 마감</span>
          )}
        </div>
        {savedBanner}
      </>
    )
  }

  // 응답 완료 + 미래 카드: 보기/변경
  if (pre && !editing) {
    return (
      <div className="mt-4 rounded-xl bg-white p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-gray-500">사전참석 응답</div>
            <div className="mt-1 flex items-center gap-2">
              {pre.status === 'attending' ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <span className="text-lg font-bold text-green-900">참석</span>
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-red-600" />
                  <span className="text-lg font-bold text-red-900">불참</span>
                </>
              )}
            </div>
            {pre.status === 'absent' && pre.reason && (
              <div className="mt-1 text-sm text-gray-700">사유: {pre.reason}</div>
            )}
          </div>
          {open ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditing(true)
                setError('')
              }}
            >
              <Pencil className="h-4 w-4" />
              변경
            </Button>
          ) : (
            <span className="text-sm text-gray-400">답변 마감</span>
          )}
        </div>
        {savedBanner}
      </div>
    )
  }

  // 마감 후 + 미응답: 폼 대신 안내
  if (!open) {
    return (
      <div className="mt-4 rounded-xl bg-white p-4">
        <div className="text-sm font-bold text-gray-900">사전참석</div>
        <p className="mt-1 text-base text-gray-600">
          답변이 마감되었습니다 (마감: {deadlineText}).
        </p>
      </div>
    )
  }

  // 편집/응답 입력 폼
  return (
    <div className="mt-4 space-y-3 rounded-xl bg-white p-4">
      <div className="text-sm font-bold text-gray-900">사전참석 — 참석 가능하신가요?</div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setStatus('attending')}
          className={`flex flex-col items-center gap-1 rounded-xl border-2 py-4 transition ${
            status === 'attending'
              ? 'border-green-600 bg-green-50 text-green-900'
              : 'border-gray-200 bg-white text-gray-700'
          }`}
        >
          <CheckCircle2 className="h-6 w-6" />
          <span className="text-base font-bold">참석</span>
        </button>
        <button
          type="button"
          onClick={() => setStatus('absent')}
          className={`flex flex-col items-center gap-1 rounded-xl border-2 py-4 transition ${
            status === 'absent'
              ? 'border-red-600 bg-red-50 text-red-900'
              : 'border-gray-200 bg-white text-gray-700'
          }`}
        >
          <XCircle className="h-6 w-6" />
          <span className="text-base font-bold">불참</span>
        </button>
      </div>

      {status === 'absent' && (
        <div>
          <Label htmlFor={`reason-${session.id}`}>불참 사유 (필수)</Label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {QUICK_REASONS.map(q => (
              <button
                key={q}
                type="button"
                onClick={() => {
                  setReason(q)
                  setError('')
                }}
                className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
                  reason === q
                    ? 'border-red-500 bg-red-50 text-red-800'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                }`}
              >
                {q}
              </button>
            ))}
          </div>
          <textarea
            id={`reason-${session.id}`}
            value={reason}
            onChange={e => {
              setReason(e.target.value.slice(0, REASON_MAX))
              setError('')
            }}
            placeholder="예: 회식, 출장, 개인일정 등"
            rows={2}
            maxLength={REASON_MAX}
            className={`mt-2 min-h-[60px] w-full rounded-xl border bg-white p-3 text-base outline-none focus:ring-2 ${
              error
                ? 'border-red-500 focus:border-red-500 focus:ring-red-100'
                : 'border-gray-300 focus:border-green-600 focus:ring-green-100'
            }`}
          />
          <div className="mt-1 text-right text-xs text-gray-400">
            {reason.length}/{REASON_MAX}
          </div>
        </div>
      )}

      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

      <p className="text-xs text-gray-500">답변 마감: {deadlineText}</p>

      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending} className="flex-1">
          {pending ? '저장 중...' : '저장'}
        </Button>
        {pre && (
          <Button
            variant="secondary"
            onClick={() => {
              setEditing(false)
              setStatus(pre.status)
              setReason(pre.reason ?? '')
              setError('')
            }}
            className="flex-1"
          >
            취소
          </Button>
        )}
      </div>
    </div>
  )
}
