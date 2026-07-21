'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Member, Presentation, Session } from '@/lib/types'
import { CopyShareButtons } from '@/components/CopyShareButtons'

const APP_URL = process.env.NEXT_PUBLIC_SITE_URL ?? ''

type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused'

type AttendanceRow = {
  id: string
  session_id: string
  member_id: string
  status: AttendanceStatus
  checked_in_at: string | null
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

  // members는 이미 name 정렬(가나다순)이라 분류 순서가 그대로 유지됨
  const groups: Record<AttendanceStatus | 'unchecked', string[]> = {
    present: [],
    late: [],
    absent: [],
    excused: [],
    unchecked: []
  }
  for (const m of members) {
    const a = attendances[m.id]
    groups[a ? a.status : 'unchecked'].push(m.name)
  }
  const counts = {
    present: groups.present.length,
    late: groups.late.length,
    absent: groups.absent.length,
    excused: groups.excused.length
  }
  const unchecked = groups.unchecked.length

  const uncheckedMessage = [
    '종가투 형님들 🙏',
    '',
    `${session.session_number}회차 출석체크가 아직 안 된 분들입니다:`,
    groups.unchecked.join(', '),
    '',
    '앱에서 출석체크 한 번만 눌러주세요.' + (APP_URL ? `\n👉 ${APP_URL}` : '')
  ].join('\n')

  const handleClick = async (memberId: string, status: AttendanceStatus) => {
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
        checked_in_at: previous?.checked_in_at ?? new Date().toISOString()
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

      <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
        체크 즉시 페널티가 보증금에서 차감/환원됩니다. 잘못 체크했다면 다시 누르면 정정됩니다.
      </div>

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
              className="rounded-xl border border-gray-200 bg-white p-3"
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
                      disabled={pendingMember === m.id}
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

      {/* 상태별 명단 */}
      <div className="space-y-3">
        <NameGroup title="출석" icon="✅" names={groups.present} cls="border-green-200 bg-green-50 text-green-800" />
        <NameGroup title="지각" icon="🕒" names={groups.late} cls="border-amber-200 bg-amber-50 text-amber-900" />
        <NameGroup title="결석" icon="❌" names={groups.absent} cls="border-red-200 bg-red-50 text-red-800" />
        <NameGroup title="공결" icon="📄" names={groups.excused} cls="border-gray-200 bg-gray-50 text-gray-700" />
        <NameGroup title="미체크" icon="⏳" names={groups.unchecked} cls="border-orange-200 bg-orange-50 text-orange-900" />
      </div>

      {unchecked > 0 && (
        <section className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="text-base font-bold text-gray-900">📢 출석체크 안내 메시지</div>
          <p className="mt-1 text-sm text-gray-600">단톡방에 복사해 보내주세요.</p>
          <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-sm leading-relaxed text-gray-800">
{uncheckedMessage}
          </pre>
          <CopyShareButtons message={uncheckedMessage} shareTitle="종가투 출석체크 안내" />
        </section>
      )}
    </div>
  )
}

function NameGroup({
  title,
  icon,
  names,
  cls
}: {
  title: string
  icon: string
  names: string[]
  cls: string
}) {
  return (
    <section className={`rounded-2xl border p-4 ${cls}`}>
      <div className="text-base font-bold">
        {icon} {title} ({names.length}명)
      </div>
      <p className="mt-1 text-lg font-semibold leading-relaxed text-gray-900">
        {names.length > 0 ? names.join(', ') : <span className="text-base font-normal text-gray-500">(없음)</span>}
      </p>
    </section>
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
