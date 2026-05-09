'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ChevronLeft, ChevronRight, MessageSquare, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import type { Member, Presentation, Session } from '@/lib/types'

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']
function formatDateKR(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  if (!y) return d
  const dt = new Date(Date.UTC(y, m - 1, day))
  return `${m}월 ${day}일 (${WEEKDAY[dt.getUTCDay()]})`
}

type ScoreKey = 'preparation' | 'delivery' | 'qna' | 'time_management' | 'attractiveness'

const SCORE_QUESTIONS: { key: ScoreKey; title: string; question: string }[] = [
  {
    key: 'preparation',
    title: '준비',
    question:
      '발표자료는 짜임새 있고, 성의있게, 여러가지 자료들을 잘 활용하여 준비되었나요?'
  },
  {
    key: 'delivery',
    title: '진행',
    question:
      '스터디때 발표자의 내용설명이 원활하게 이루어지고 청취자 입장에서 알아듣기 쉽게, 전달력 있게 잘 진행 되었나요?'
  },
  {
    key: 'qna',
    title: '질의응답',
    question:
      '발표자는 Q&A시간에 질문에 대한 답변 준비가 잘 되었으며 스터디원들의 질문에 대한 답변이 명확하게 잘 이루어 졌나요?'
  },
  {
    key: 'time_management',
    title: '시간배분',
    question: '발표자는 주어진 시간을 부족하거나 초과하지 않고 발표가 잘 이루어 졌나요?'
  },
  {
    key: 'attractiveness',
    title: '매력도',
    question:
      '발표자가 준비한 기업분석과 발표내용을 토대로 본인이 투자하기에 충분히 매력적이고 논리적이며 설득력 있었나요?'
  }
]

const RATING_OPTIONS: { value: number; stars: string; label: string }[] = [
  { value: 5, stars: '⭐⭐⭐⭐⭐', label: '매우 그렇다' },
  { value: 4, stars: '⭐⭐⭐⭐', label: '그렇다' },
  { value: 3, stars: '⭐⭐⭐', label: '보통이다' },
  { value: 2, stars: '⭐⭐', label: '그렇지 않다' },
  { value: 1, stars: '⭐', label: '매우 그렇지 않다' }
]

const PRESENTATION_FEEDBACK_GUIDE =
  '발표자에 대한 전반적인 피드백 전달해주세요. 칭찬할 점, 개선되어야 할 점 서로의 발전을 위해서 상세한 피드백일 수록 건전한 스터디 문화를 만들어 갈 수 있으니 최대한 장단점 모두 하나씩 길게 적어주세요!'

const LISTENER_FEEDBACK_GUIDE =
  '청취자에 대한 전반적인 피드백 전달해주세요. (A청취자는 스터디 처음부터 끝까지 좋은 자세로 스터디에 참석하였는지 / 중간에 어디를 가거나 다른 일을 한다든지 / B 청취자는 스터디 내용에 대해 적극적으로 질문도 하고 토론도하며 열정적으로 참여하였는지 / C청취자의 잘한점, 아쉬운 점 등 자유롭게 기재!)'

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

type DraftScores = Record<ScoreKey, number>
const EMPTY_SCORES: DraftScores = {
  preparation: 0,
  delivery: 0,
  qna: 0,
  time_management: 0,
  attractiveness: 0
}

export function EvaluationForm({
  me,
  session,
  presentations,
  members
}: {
  me: Member
  session: Session
  presentations: Presentation[]
  members: Member[]
}) {
  const evaluatable = useMemo(
    () =>
      presentations.filter(
        p => p.presenter_id !== null && p.presenter_id !== me.id
      ),
    [presentations, me.id]
  )

  const [step, setStep] = useState(0) // 0..N-1 = presenter, N = listener, N+1 = done
  const [evals, setEvals] = useState<Record<string, Evaluation>>({})
  const [listener, setListener] = useState<ListenerFeedback | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch(`/api/evaluations?session_id=${session.id}`).then(r => r.json()),
      fetch(`/api/listener-feedback?session_id=${session.id}`).then(r => r.json())
    ]).then(([eJson, lJson]) => {
      if (cancelled) return
      const map: Record<string, Evaluation> = {}
      for (const e of (eJson.evaluations as Evaluation[]) ?? []) map[e.presentation_id] = e
      setEvals(map)
      const lf = lJson.feedback ?? null
      setListener(lf)

      // 저장된 진행 상태에 맞춰 step 복원
      // - 평가 대상 0건: listener 저장됐으면 done(1), 아니면 listener step(0)
      // - 미완료 발표자가 있으면 그 인덱스로
      // - 발표자 모두 완료 + listener 저장: done
      // - 발표자 모두 완료 + listener 미저장: listener step
      const N = evaluatable.length
      if (N === 0) {
        setStep(lf ? 1 : 0)
      } else {
        const firstUnfinished = evaluatable.findIndex(p => !map[p.id])
        if (firstUnfinished >= 0) {
          setStep(firstUnfinished)
        } else if (lf) {
          setStep(N + 1)
        } else {
          setStep(N)
        }
      }
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [session.id, evaluatable])

  const memberName = (id: string) => members.find(m => m.id === id)?.name ?? '(알수없음)'
  const totalSteps = evaluatable.length + 1 // last step = listener feedback
  const isPresenterStep = step < evaluatable.length
  const isListenerStep = step === evaluatable.length
  const isDoneStep = step > evaluatable.length

  if (!loaded) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center text-gray-500">
        불러오는 중...
      </div>
    )
  }

  const sessionHeader = (
    <section className="rounded-2xl bg-green-50 p-5">
      <div className="text-xs font-bold text-green-700">평가 회차</div>
      <div className="mt-1 text-2xl font-bold text-green-900">{formatDateKR(session.date)}</div>
      <div className="mt-1 text-sm text-green-800">
        {session.session_number}회차 · 평가 대상 {evaluatable.length}건
        {presentations.length > evaluatable.length && (
          <span className="ml-1 text-green-700">
            (본인 발표 {presentations.length - evaluatable.length}건은 자동 제외)
          </span>
        )}
      </div>
      <div className="mt-3 text-base font-semibold text-green-900">
        평가자: {me.name}
      </div>
    </section>
  )

  if (evaluatable.length === 0) {
    return (
      <div className="space-y-5">
        {sessionHeader}
        <ListenerFeedbackStep
          sessionId={session.id}
          existing={listener}
          onSaved={lf => {
            setListener(lf)
            setStep(evaluatable.length + 1)
          }}
          onSkip={() => setStep(evaluatable.length + 1)}
          isOnly={true}
        />
        {isDoneStep && <DoneScreen />}
      </div>
    )
  }

  if (isDoneStep) {
    return (
      <div className="space-y-5">
        {sessionHeader}
        <DoneScreen />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {sessionHeader}

      <StepIndicator step={step} total={totalSteps} />

      {isPresenterStep && (
        <PresenterStep
          key={evaluatable[step].id}
          index={step}
          total={evaluatable.length}
          presentation={evaluatable[step]}
          presenterNames={
            evaluatable[step].presenter_id
              ? [memberName(evaluatable[step].presenter_id!)]
              : []
          }
          existing={evals[evaluatable[step].id]}
          sessionId={session.id}
          onSaved={updated => {
            setEvals(prev => ({ ...prev, [updated.presentation_id]: updated }))
            setStep(step + 1)
          }}
          onPrev={step > 0 ? () => setStep(step - 1) : null}
        />
      )}

      {isListenerStep && (
        <ListenerFeedbackStep
          sessionId={session.id}
          existing={listener}
          onSaved={lf => {
            setListener(lf)
            setStep(step + 1)
          }}
          onSkip={() => setStep(step + 1)}
          onPrev={() => setStep(step - 1)}
          isOnly={false}
        />
      )}
    </div>
  )
}

/* ─────────────── Step Indicator ─────────────── */

function StepIndicator({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="text-sm font-bold text-gray-700">
        {Math.min(step + 1, total)} / {total}
      </div>
      <div className="flex flex-1 gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'h-1.5 flex-1 rounded-full',
              i < step ? 'bg-green-600' : i === step ? 'bg-green-400' : 'bg-gray-200'
            )}
          />
        ))}
      </div>
    </div>
  )
}

/* ─────────────── Presenter Step ─────────────── */

function PresenterStep({
  index,
  total,
  presentation,
  presenterNames,
  existing,
  sessionId,
  onSaved,
  onPrev
}: {
  index: number
  total: number
  presentation: Presentation
  presenterNames: string[]
  existing: Evaluation | undefined
  sessionId: string
  onSaved: (e: Evaluation) => void
  onPrev: (() => void) | null
}) {
  const [scores, setScores] = useState<DraftScores>(() =>
    existing
      ? {
          preparation: existing.preparation,
          delivery: existing.delivery,
          qna: existing.qna,
          time_management: existing.time_management,
          attractiveness: existing.attractiveness
        }
      : { ...EMPTY_SCORES }
  )
  const [feedback, setFeedback] = useState(existing?.feedback ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const allRated = SCORE_QUESTIONS.every(q => scores[q.key] >= 1 && scores[q.key] <= 5)
  const feedbackOk = feedback.trim().length > 0

  const submit = async () => {
    setError('')
    if (!allRated) {
      setError('5개 평가 항목을 모두 선택해주세요.')
      return
    }
    if (!feedbackOk) {
      setError('종합 피드백을 작성해주세요.')
      return
    }
    setPending(true)
    const r = await fetch('/api/evaluations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        presentation_id: presentation.id,
        session_id: sessionId,
        preparation: scores.preparation,
        delivery: scores.delivery,
        qna: scores.qna,
        time_management: scores.time_management,
        attractiveness: scores.attractiveness,
        feedback: feedback.trim()
      })
    })
    setPending(false)
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      setError(j.error || '저장 실패')
      return
    }
    onSaved({
      id: existing?.id ?? 'temp',
      session_id: sessionId,
      evaluator_id: existing?.evaluator_id ?? '',
      presentation_id: presentation.id,
      preparation: scores.preparation,
      delivery: scores.delivery,
      qna: scores.qna,
      time_management: scores.time_management,
      attractiveness: scores.attractiveness,
      feedback: feedback.trim()
    })
  }

  return (
    <div className="space-y-5">
      {/* 발표자 헤더 */}
      <section className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-base font-bold">
            {presentation.slot}
          </div>
          <div className="flex-1">
            <div className="text-xs text-gray-500">
              {index + 1}번째 발표자 ({index + 1}/{total})
            </div>
            <div className="text-xl font-bold text-gray-900">
              {presenterNames.join(', ')}
            </div>
            {presentation.company_name && (
              <div className="mt-0.5 text-base text-gray-700">{presentation.company_name}</div>
            )}
          </div>
          {existing && (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-1 text-xs font-semibold text-green-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> 저장됨
            </span>
          )}
        </div>
      </section>

      {/* 5개 평가 항목 */}
      {SCORE_QUESTIONS.map((q, i) => (
        <RatingQuestion
          key={q.key}
          number={i + 1}
          title={q.title}
          question={q.question}
          value={scores[q.key]}
          onChange={v => setScores(prev => ({ ...prev, [q.key]: v }))}
        />
      ))}

      {/* 종합 피드백 */}
      <section className="rounded-2xl border border-gray-200 bg-white p-4">
        <Label htmlFor={`feedback-${presentation.id}`} className="text-base font-bold">
          종합 피드백 (필수)
        </Label>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          {PRESENTATION_FEEDBACK_GUIDE}
        </p>
        <textarea
          id={`feedback-${presentation.id}`}
          value={feedback}
          onChange={e => setFeedback(e.target.value)}
          rows={6}
          placeholder="장단점 모두 구체적으로 적어주세요"
          className="mt-3 w-full rounded-xl border border-gray-300 bg-white p-3 text-base outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
        />
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* 페이저 버튼 */}
      <div className="flex gap-3">
        {onPrev ? (
          <Button
            type="button"
            variant="outline"
            onClick={onPrev}
            className="h-14 flex-1"
          >
            <ChevronLeft className="h-5 w-5" />
            이전
          </Button>
        ) : null}
        <Button
          type="button"
          onClick={submit}
          disabled={pending}
          className={cn('h-14', onPrev ? 'flex-1' : 'w-full')}
        >
          {pending ? '저장 중...' : '저장하고 다음'}
          <ChevronRight className="h-5 w-5" />
        </Button>
      </div>
    </div>
  )
}

/* ─────────────── Rating Question ─────────────── */

function RatingQuestion({
  number,
  title,
  question,
  value,
  onChange
}: {
  number: number
  title: string
  question: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="text-sm font-bold text-green-700">
        Q{number}. {title}
      </div>
      <p className="mt-2 text-base leading-relaxed text-gray-800">{question}</p>
      <div className="mt-4 space-y-2">
        {RATING_OPTIONS.map(opt => {
          const active = opt.value === value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              aria-pressed={active}
              className={cn(
                'flex w-full items-center justify-between rounded-xl border-2 px-4 py-3 text-left transition',
                active
                  ? 'border-amber-500 bg-amber-50 shadow-sm'
                  : 'border-gray-200 bg-white hover:border-amber-300'
              )}
              style={{ minHeight: 56 }}
            >
              <span className="text-xl tracking-tight">{opt.stars}</span>
              <span
                className={cn(
                  'text-base font-semibold',
                  active ? 'text-amber-900' : 'text-gray-700'
                )}
              >
                {opt.label}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}

/* ─────────────── Listener Feedback Step ─────────────── */

function ListenerFeedbackStep({
  sessionId,
  existing,
  onSaved,
  onSkip,
  onPrev,
  isOnly
}: {
  sessionId: string
  existing: ListenerFeedback | null
  onSaved: (lf: ListenerFeedback) => void
  onSkip: () => void
  onPrev?: () => void
  isOnly: boolean
}) {
  const [content, setContent] = useState(existing?.content ?? '')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    setError('')
    if (!content.trim()) {
      setError('내용을 입력해주세요. 건너뛰려면 아래 "건너뛰기" 를 눌러주세요.')
      return
    }
    setPending(true)
    const r = await fetch('/api/listener-feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, content: content.trim() })
    })
    setPending(false)
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      setError(j.error || '저장 실패')
      return
    }
    onSaved({
      id: existing?.id ?? 'temp',
      session_id: sessionId,
      evaluator_id: existing?.evaluator_id ?? '',
      content: content.trim(),
      created_at: existing?.created_at ?? new Date().toISOString()
    })
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-green-700" />
          <h2 className="text-lg font-bold text-gray-900">청취자 종합 피드백 (선택)</h2>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-gray-600">
          {LISTENER_FEEDBACK_GUIDE}
        </p>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          rows={8}
          placeholder="A청취자: ... / B청취자: ... / C청취자: ..."
          className="mt-3 w-full rounded-xl border border-gray-300 bg-white p-3 text-base outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
        />
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        {onPrev ? (
          <Button type="button" variant="outline" onClick={onPrev} className="h-14 flex-1">
            <ChevronLeft className="h-5 w-5" />
            이전
          </Button>
        ) : null}
        <Button
          type="button"
          variant="outline"
          onClick={onSkip}
          className="h-14 flex-1"
        >
          {isOnly ? '닫기' : '건너뛰기'}
        </Button>
        <Button type="button" onClick={submit} disabled={pending} className="h-14 flex-1">
          <Send className="h-5 w-5" />
          {pending ? '저장 중...' : '제출'}
        </Button>
      </div>
    </div>
  )
}

/* ─────────────── Done Screen ─────────────── */

function DoneScreen() {
  return (
    <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center">
      <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
      <h2 className="mt-3 text-xl font-bold text-green-900">평가가 완료됐습니다!</h2>
      <p className="mt-2 text-sm leading-relaxed text-green-800">
        소중한 평가 감사합니다. 결과는 운영진이 정리해 별도 모임에서 안내드립니다.
      </p>
    </div>
  )
}
