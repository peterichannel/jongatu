'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Lock, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Member, Presentation, Session } from '@/lib/types'

type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused'

type AttendanceRow = {
  id: string
  session_id: string
  member_id: string
  status: AttendanceStatus
  checked_in_at: string | null
  is_confirmed: boolean
}

type PreAttendanceRow = {
  session_id: string
  member_id: string
  status: 'attending' | 'absent'
  reason: string | null
}

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: '출석',
  late: '지각',
  absent: '결석',
  excused: '공결'
}

const STATUS_STYLE: Record<AttendanceStatus, { active: string; inactive: string }> = {
  present: {
    active: 'border-green-600 bg-green-600 text-white',
    inactive: 'border-gray-200 bg-white text-gray-700 hover:border-green-300'
  },
  late: {
    active: 'border-amber-500 bg-amber-500 text-white',
    inactive: 'border-gray-200 bg-white text-gray-700 hover:border-amber-300'
  },
  absent: {
    active: 'border-red-600 bg-red-600 text-white',
    inactive: 'border-gray-200 bg-white text-gray-700 hover:border-red-300'
  },
  excused: {
    active: 'border-gray-500 bg-gray-500 text-white',
    inactive: 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'
  }
}

const STATUS_ORDER: AttendanceStatus[] = ['present', 'late', 'absent', 'excused']

export function AttendanceChecker({
  session,
  presentations,
  members,
  initialAttendances,
  preAttendances
}: {
  session: Session
  presentations: Presentation[]
  members: Member[]
  initialAttendances: AttendanceRow[]
  preAttendances: PreAttendanceRow[]
}) {
  const router = useRouter()

  const [attendances, setAttendances] = useState<Record<string, AttendanceRow | undefined>>(() => {
    const map: Record<string, AttendanceRow> = {}
    for (const a of initialAttendances) map[a.member_id] = a
    return map
  })
  const [pendingMember, setPendingMember] = useState<string | null>(null)
  const [error, setError] = useState('')

  const preMap = useMemo(() => {
    const map = new Map<string, PreAttendanceRow>()
    for (const p of preAttendances) map.set(p.member_id, p)
    return map
  }, [preAttendances])

  const presenterIds = useMemo(() => {
    const set = new Set<string>()
    for (const p of presentations) if (p.presenter_id) set.add(p.presenter_id)
    return set
  }, [presentations])

  const anyConfirmed = Object.values(attendances).some(a => a?.is_confirmed)

  const counts: Record<AttendanceStatus, number> = {
    present: 0,
    late: 0,
    absent: 0,
    excused: 0
  }
  let unchecked = 0
  for (const m of members) {
    const a = attendances[m.id]
    if (a) counts[a.status] += 1
    else unchecked += 1
  }

  const handleClick = async (memberId: string, status: AttendanceStatus) => {
    if (anyConfirmed) return
    setError('')
    const previous = attendances[memberId]
    if (previous?.status === status) return
    setPendingMember(memberId)

    setAttendances(prev => ({
      ...prev,
      [memberId]: {
        id: previous?.id ?? `temp-${memberId}`,
        session_id: session.id,
        member_id: memberId,
        status,
        checked_in_at: previous?.checked_in_at ?? new Date().toISOString(),
        is_confirmed: false
      }
    }))

    const r = await fetch('/api/admin/attendances', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session_id: session.id, member_id: memberId, status })
    })
    setPendingMember(null)
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      setError(j.error || '저장 실패')
      setAttendances(prev => ({ ...prev, [memberId]: previous }))
    } else {
      router.refresh()
    }
  }

  return (
    <div className="space-y-5">
      {/* 통계 */}
      <div className="grid grid-cols-5 gap-2 rounded-2xl border border-gray-200 bg-white p-3 text-center text-sm">
        <Counter label="출석" value={counts.present} color="text-green-700" />
        <Counter label="지각" value={counts.late} color="text-amber-700" />
        <Counter label="결석" value={counts.absent} color="text-red-700" />
        <Counter label="공결" value={counts.excused} color="text-gray-700" />
        <Counter label="미체크" value={unchecked} color="text-gray-400" />
      </div>

      {anyConfirmed && (
        <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          <ShieldCheck className="h-5 w-5" />
          출결이 확정되었습니다. 더 이상 변경할 수 없습니다.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* 멤버별 체크 */}
      <div className="space-y-2">
        {members.map(m => {
          const current = attendances[m.id]
          const pre = preMap.get(m.id)
          const isPresenter = presenterIds.has(m.id)
          return (
            <div
              key={m.id}
              className={`rounded-xl border p-3 ${
                current?.is_confirmed
                  ? 'border-gray-200 bg-gray-50'
                  : 'border-gray-200 bg-white'
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-gray-900">{m.name}</span>
                    {isPresenter && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                        ⭐ 발표
                      </span>
                    )}
                    {current?.is_confirmed && <Lock className="h-3.5 w-3.5 text-gray-400" />}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    {pre
                      ? pre.status === 'attending'
                        ? '사전: 참석'
                        : `사전: 불참 (${pre.reason ?? '사유 없음'})`
                      : '사전: 미응답'}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {STATUS_ORDER.map(s => {
                  const active = current?.status === s
                  const style = STATUS_STYLE[s]
                  return (
                    <button
                      key={s}
                      type="button"
                      disabled={anyConfirmed || pendingMember === m.id}
                      onClick={() => handleClick(m.id, s)}
                      className={`rounded-lg border-2 py-3 text-base font-bold transition disabled:opacity-50 ${
                        active ? style.active : style.inactive
                      }`}
                    >
                      {STATUS_LABEL[s]}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* 출결 확정 진입 */}
      {!anyConfirmed && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="mb-2 text-sm text-gray-700">
            모든 멤버 체크가 끝나면 출결을 확정하세요. 확정 시 페널티가 자동으로 적용됩니다.
          </div>
          {unchecked > 0 ? (
            <Button disabled className="w-full">
              {unchecked}명 체크 후 확정 가능
            </Button>
          ) : (
            <ConfirmAttendanceButton sessionId={session.id} />
          )}
        </div>
      )}
    </div>
  )
}

function Counter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
    </div>
  )
}

function ConfirmAttendanceButton({ sessionId }: { sessionId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const handleConfirm = async () => {
    if (
      !confirm(
        '출결을 확정하시겠습니까?\n\n페널티 (결석/지각/사전참석 미응답/발표 미수행)가 자동으로 보증금에서 차감되고 운영비에 입금됩니다. 확정 후에는 변경할 수 없습니다.'
      )
    )
      return
    setPending(true)
    setError('')
    const r = await fetch(`/api/admin/sessions/${sessionId}/confirm`, { method: 'POST' })
    setPending(false)
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      setError(j.error || '확정 실패')
      return
    }
    router.refresh()
  }

  return (
    <>
      <Button onClick={handleConfirm} disabled={pending} variant="primary" className="w-full">
        <ShieldCheck className="h-5 w-5" />
        {pending ? '확정 중...' : '출결 확정 + 페널티 적용'}
      </Button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </>
  )
}
