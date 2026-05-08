'use client'

import { useMemo, useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Star,
  MessageSquare,
  ExternalLink,
  AlertCircle
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Member, Presentation, Session } from '@/lib/types'

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']
function formatDateKR(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  if (!y) return d
  const dt = new Date(Date.UTC(y, m - 1, day))
  return `${m}월 ${day}일 (${WEEKDAY[dt.getUTCDay()]})`
}

const SCORE_LABEL: Record<ScoreKey, string> = {
  preparation: '준비',
  delivery: '진행',
  qna: 'Q&A',
  time_management: '시간',
  attractiveness: '매력'
}
const SCORE_KEYS: ScoreKey[] = [
  'preparation',
  'delivery',
  'qna',
  'time_management',
  'attractiveness'
]

type ScoreKey =
  | 'preparation'
  | 'delivery'
  | 'qna'
  | 'time_management'
  | 'attractiveness'

type Evaluation = {
  id: string
  session_id: string
  evaluator_id: string
  presentation_id: string
  preparation: number
  delivery: number
  qna: number
  time_management: number
  attractiveness: number
  feedback: string
}

type ListenerFeedback = {
  id: string
  session_id: string
  evaluator_id: string
  content: string
  created_at: string
}

type AttendanceRow = {
  session_id: string
  member_id: string
  status: 'present' | 'late' | 'absent' | 'excused'
}

type ViewMode = 'session' | 'presenter'

export function EvaluationResults({
  sessions,
  presentations,
  evaluations,
  listenerFeedbacks,
  attendances,
  members
}: {
  sessions: Session[]
  presentations: Presentation[]
  evaluations: Evaluation[]
  listenerFeedbacks: ListenerFeedback[]
  attendances: AttendanceRow[]
  members: Member[]
}) {
  const [view, setView] = useState<ViewMode>('session')

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1">
        <TabButton active={view === 'session'} onClick={() => setView('session')}>
          회차별
        </TabButton>
        <TabButton active={view === 'presenter'} onClick={() => setView('presenter')}>
          발표자별 누적
        </TabButton>
      </div>

      {view === 'session' ? (
        <SessionView
          sessions={sessions}
          presentations={presentations}
          evaluations={evaluations}
          listenerFeedbacks={listenerFeedbacks}
          attendances={attendances}
          members={members}
        />
      ) : (
        <PresenterView
          sessions={sessions}
          presentations={presentations}
          evaluations={evaluations}
          members={members}
        />
      )}
    </div>
  )
}

function TabButton({
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
        'rounded-lg px-4 py-2 text-sm font-semibold transition',
        active ? 'bg-gray-900 text-white' : 'text-gray-600 hover:text-gray-900'
      )}
    >
      {children}
    </button>
  )
}

/* ─────────────── 회차별 ─────────────── */

function SessionView({
  sessions,
  presentations,
  evaluations,
  listenerFeedbacks,
  attendances,
  members
}: {
  sessions: Session[]
  presentations: Presentation[]
  evaluations: Evaluation[]
  listenerFeedbacks: ListenerFeedback[]
  attendances: AttendanceRow[]
  members: Member[]
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const memberName = (id: string) => members.find(m => m.id === id)?.name ?? '(알수없음)'
  const activeMembers = useMemo(
    () => members.filter(m => m.is_active),
    [members]
  )

  const presBySession = useMemo(() => {
    const m = new Map<string, Presentation[]>()
    for (const p of presentations) {
      const arr = m.get(p.session_id) ?? []
      arr.push(p)
      m.set(p.session_id, arr)
    }
    return m
  }, [presentations])

  const evalsByPres = useMemo(() => {
    const m = new Map<string, Evaluation[]>()
    for (const e of evaluations) {
      const arr = m.get(e.presentation_id) ?? []
      arr.push(e)
      m.set(e.presentation_id, arr)
    }
    return m
  }, [evaluations])

  const evalsBySession = useMemo(() => {
    const m = new Map<string, Evaluation[]>()
    for (const e of evaluations) {
      const arr = m.get(e.session_id) ?? []
      arr.push(e)
      m.set(e.session_id, arr)
    }
    return m
  }, [evaluations])

  const lfBySession = useMemo(() => {
    const m = new Map<string, ListenerFeedback[]>()
    for (const lf of listenerFeedbacks) {
      const arr = m.get(lf.session_id) ?? []
      arr.push(lf)
      m.set(lf.session_id, arr)
    }
    return m
  }, [listenerFeedbacks])

  const attendedBySession = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const a of attendances) {
      if (a.status === 'present' || a.status === 'late') {
        if (!m.has(a.session_id)) m.set(a.session_id, new Set())
        m.get(a.session_id)!.add(a.member_id)
      }
    }
    return m
  }, [attendances])

  const sessionsWithContent = sessions.filter(s => (presBySession.get(s.id) ?? []).length > 0)

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (sessionsWithContent.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-gray-500">
        아직 발표가 등록된 회차가 없습니다.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {sessionsWithContent.map(session => {
        const pres = presBySession.get(session.id) ?? []
        const lfs = lfBySession.get(session.id) ?? []
        const sessionEvals = evalsBySession.get(session.id) ?? []

        const attended = attendedBySession.get(session.id)
        const presenterIds = new Set<string>()
        for (const p of pres) {
          if (p.presenter_id) presenterIds.add(p.presenter_id)
        }
        // 평가 가능 인원 = 출석자(있으면) 또는 전체 활성 - 발표자
        const evaluablePool: Member[] = (
          attended && attended.size > 0
            ? activeMembers.filter(m => attended.has(m.id))
            : activeMembers
        ).filter(m => !presenterIds.has(m.id))

        const evaluatorsWhoSubmitted = new Set(sessionEvals.map(e => e.evaluator_id))
        const missingEvaluators = evaluablePool.filter(
          m => !evaluatorsWhoSubmitted.has(m.id)
        )

        return (
          <div
            key={session.id}
            className="overflow-hidden rounded-2xl border border-gray-200 bg-white"
          >
            <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
              <div className="text-xs text-gray-500">{session.session_number}회차</div>
              <div className="text-base font-bold text-gray-900">
                {formatDateKR(session.date)}
              </div>
              <div className="mt-1 text-xs text-gray-600">
                평가 가능 {evaluablePool.length}명 · 응답 {evaluatorsWhoSubmitted.size}명
                {missingEvaluators.length > 0 && (
                  <span className="ml-1 text-amber-700">
                    · 미응답 {missingEvaluators.length}명
                  </span>
                )}
              </div>
            </div>
            <div className="divide-y divide-gray-100">
              {pres.map(p => {
                const evals = evalsByPres.get(p.id) ?? []
                const open = expanded.has(p.id)
                const avg = computeAverages(evals)
                const overall = computeOverall(avg)
                return (
                  <div key={p.id} className="p-4">
                    <button
                      type="button"
                      onClick={() => toggle(p.id)}
                      className="flex w-full items-start gap-3 text-left"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-sm font-bold">
                        {p.slot}
                      </div>
                      <div className="flex-1">
                        <div className="text-base font-bold text-gray-900">
                          {p.special_label
                            ? p.special_label
                            : p.presenter_id
                              ? memberName(p.presenter_id)
                              : '(빈 슬롯)'}
                        </div>
                        {p.company_name && (
                          <div className="mt-0.5 text-sm text-gray-600">{p.company_name}</div>
                        )}
                        {evals.length > 0 ? (
                          <>
                            <div className="mt-2 flex items-center gap-2 text-sm">
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-900">
                                종합 {overall.toFixed(2)}/5
                              </span>
                              <span className="text-xs text-gray-500">
                                평가 {evals.length}건
                              </span>
                            </div>
                            <div className="mt-2 grid grid-cols-5 gap-1 text-xs">
                              {SCORE_KEYS.map(k => (
                                <ScoreCompact key={k} label={SCORE_LABEL[k]} value={avg[k]} />
                              ))}
                            </div>
                          </>
                        ) : (
                          <div className="mt-2 text-xs text-gray-400">아직 평가 없음</div>
                        )}
                      </div>
                      {open ? (
                        <ChevronUp className="h-5 w-5 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-gray-400" />
                      )}
                    </button>

                    {open && (
                      <div className="mt-4 space-y-3 border-t border-gray-100 pt-3">
                        {p.cafe_url && (
                          <a
                            href={p.cafe_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                          >
                            카페 자료 <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                        {evals.length === 0 ? (
                          <p className="text-sm text-gray-500">아직 평가가 없습니다.</p>
                        ) : (
                          <ul className="space-y-2">
                            {evals.map(e => (
                              <li key={e.id} className="rounded-lg bg-gray-50 p-3 text-sm">
                                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-semibold text-gray-700">
                                    {memberName(e.evaluator_id)}
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    준비 {e.preparation} · 진행 {e.delivery} · Q&A {e.qna}
                                    {' · '}
                                    시간 {e.time_management} · 매력 {e.attractiveness}
                                  </span>
                                </div>
                                <div className="whitespace-pre-wrap text-gray-700">
                                  {e.feedback}
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {missingEvaluators.length > 0 && (
              <div className="border-t border-gray-100 bg-amber-50/40 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-bold text-amber-900">
                  <AlertCircle className="h-4 w-4" />
                  미응답자 ({missingEvaluators.length})
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {missingEvaluators.map(m => (
                    <span
                      key={m.id}
                      className="rounded-full bg-white px-2 py-1 text-xs text-amber-900 ring-1 ring-amber-200"
                    >
                      {m.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {lfs.length > 0 && (
              <div className="border-t border-gray-100 bg-blue-50/40 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-bold text-gray-700">
                  <MessageSquare className="h-4 w-4" />
                  청취자 종합 피드백 ({lfs.length})
                </div>
                <ul className="space-y-2">
                  {lfs.map(lf => (
                    <li key={lf.id} className="rounded-lg bg-white p-3 text-sm">
                      <div className="mb-1 text-xs font-semibold text-gray-500">
                        {memberName(lf.evaluator_id)}
                      </div>
                      <div className="whitespace-pre-wrap text-gray-700">{lf.content}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ─────────────── 발표자별 누적 ─────────────── */

function PresenterView({
  sessions,
  presentations,
  evaluations,
  members
}: {
  sessions: Session[]
  presentations: Presentation[]
  evaluations: Evaluation[]
  members: Member[]
}) {
  const sessionMap = useMemo(() => new Map(sessions.map(s => [s.id, s])), [sessions])

  // 발표자별 발표 → 평가 묶기
  type PresenterRecord = {
    member: Member
    presentations: {
      presentation: Presentation
      session: Session
      evaluations: Evaluation[]
    }[]
  }
  const records: PresenterRecord[] = useMemo(() => {
    const byMember = new Map<string, PresenterRecord>()
    for (const p of presentations) {
      const session = sessionMap.get(p.session_id)
      if (!session) continue
      const id = p.presenter_id
      if (!id) continue
      const member = members.find(m => m.id === id)
      if (!member) continue
      if (!byMember.has(id)) byMember.set(id, { member, presentations: [] })
      const evs = evaluations.filter(e => e.presentation_id === p.id)
      byMember.get(id)!.presentations.push({ presentation: p, session, evaluations: evs })
    }
    // 평가 1건 이상 있거나 발표가 1건 이상인 사람만, 이름순
    return Array.from(byMember.values())
      .filter(r => r.presentations.length > 0)
      .sort((a, b) => a.member.name.localeCompare(b.member.name))
  }, [presentations, evaluations, members, sessionMap])

  if (records.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-gray-500">
        발표 이력이 없습니다.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {records.map(r => {
        const allEvals = r.presentations.flatMap(p => p.evaluations)
        const cumulativeAvg = computeAverages(allEvals)
        const cumulativeOverall = computeOverall(cumulativeAvg)
        return (
          <div
            key={r.member.id}
            className="overflow-hidden rounded-2xl border border-gray-200 bg-white"
          >
            <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="text-base font-bold text-gray-900">{r.member.name}</div>
                <div className="text-xs text-gray-600">
                  발표 {r.presentations.length}건 · 평가 {allEvals.length}건
                </div>
              </div>
              {allEvals.length > 0 ? (
                <>
                  <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-900">
                    누적 종합 {cumulativeOverall.toFixed(2)}/5
                  </div>
                  <div className="mt-2 grid grid-cols-5 gap-1 text-xs">
                    {SCORE_KEYS.map(k => (
                      <ScoreCompact key={k} label={SCORE_LABEL[k]} value={cumulativeAvg[k]} />
                    ))}
                  </div>
                </>
              ) : (
                <div className="mt-2 text-xs text-gray-500">평가 데이터 없음</div>
              )}
            </div>
            <div className="divide-y divide-gray-100">
              {r.presentations
                .slice()
                .sort((a, b) => a.session.session_number - b.session.session_number)
                .map(({ presentation, session, evaluations: evs }) => {
                  const avg = computeAverages(evs)
                  const overall = computeOverall(avg)
                  return (
                    <div key={presentation.id} className="p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div className="text-sm font-semibold text-gray-900">
                          {session.session_number}회차 ·{' '}
                          {presentation.company_name ?? '발표'}
                        </div>
                        <div className="text-xs text-gray-500">
                          {formatDateKR(session.date)} · 평가 {evs.length}건
                        </div>
                      </div>
                      {evs.length > 0 ? (
                        <>
                          <div className="mt-1 text-xs text-gray-600">
                            종합 {overall.toFixed(2)}/5
                          </div>
                          <div className="mt-2 grid grid-cols-5 gap-1 text-xs">
                            {SCORE_KEYS.map(k => (
                              <ScoreCompact
                                key={k}
                                label={SCORE_LABEL[k]}
                                value={avg[k]}
                              />
                            ))}
                          </div>
                        </>
                      ) : (
                        <p className="mt-1 text-xs text-gray-400">평가 없음</p>
                      )}
                    </div>
                  )
                })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ─────────────── helpers ─────────────── */

function computeAverages(evals: Evaluation[]): Record<ScoreKey, number> {
  if (evals.length === 0) {
    return { preparation: 0, delivery: 0, qna: 0, time_management: 0, attractiveness: 0 }
  }
  const n = evals.length
  return {
    preparation: evals.reduce((s, e) => s + e.preparation, 0) / n,
    delivery: evals.reduce((s, e) => s + e.delivery, 0) / n,
    qna: evals.reduce((s, e) => s + e.qna, 0) / n,
    time_management: evals.reduce((s, e) => s + e.time_management, 0) / n,
    attractiveness: evals.reduce((s, e) => s + e.attractiveness, 0) / n
  }
}

function computeOverall(avg: Record<ScoreKey, number>) {
  return SCORE_KEYS.reduce((s, k) => s + avg[k], 0) / SCORE_KEYS.length
}

function ScoreCompact({ label, value }: { label: string; value: number }) {
  if (!value) {
    return (
      <span className="flex flex-col items-center rounded-lg bg-gray-50 px-1 py-1 text-gray-400">
        <span className="text-[10px]">{label}</span>
        <span className="text-xs">-</span>
      </span>
    )
  }
  return (
    <span className="flex flex-col items-center rounded-lg bg-amber-50 px-1 py-1">
      <span className="text-[10px] text-amber-700">{label}</span>
      <span className="inline-flex items-center gap-0.5 text-xs font-bold text-amber-900">
        <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
        {value.toFixed(1)}
      </span>
    </span>
  )
}
