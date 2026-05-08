'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type SimpleMember = { id: string; name: string }
type Step = 'select' | 'pin' | 'recover'
type Mode = 'setup' | 'verify'

export function MemberAuthFlow({ members }: { members: SimpleMember[] }) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('select')
  const [selected, setSelected] = useState<SimpleMember | null>(null)
  const [mode, setMode] = useState<Mode>('verify')
  const [pin, setPin] = useState('')
  const [pinConfirm, setPinConfirm] = useState('')
  const [recoveryAnswer, setRecoveryAnswer] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const resetState = () => {
    setPin('')
    setPinConfirm('')
    setRecoveryAnswer('')
    setError('')
  }

  const handleSelectChange = async (id: string) => {
    setError('')
    if (!id) {
      setSelected(null)
      return
    }
    const member = members.find(m => m.id === id) ?? null
    if (!member) return
    setSelected(member)
    setLoading(true)
    try {
      const r = await fetch(`/api/member-auth/status?member_id=${id}`)
      const j = await r.json()
      setMode(j.has_pin ? 'verify' : 'setup')
      resetState()
      setStep('pin')
    } catch {
      setError('상태 확인 실패. 잠시 후 다시 시도해주세요.')
    } finally {
      setLoading(false)
    }
  }

  const submitPin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!selected) return
    if (!/^\d{4,8}$/.test(pin)) {
      setError('PIN은 4자리 이상 숫자입니다.')
      return
    }
    if (mode === 'setup') {
      if (pin !== pinConfirm) {
        setError('확인용 PIN이 일치하지 않습니다.')
        return
      }
      if (!recoveryAnswer.trim()) {
        setError('어머니 성함을 입력해주세요. PIN 분실 시 본인 확인용입니다.')
        return
      }
    }
    setLoading(true)
    const r = await fetch('/api/member-auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        member_id: selected.id,
        pin,
        ...(mode === 'setup' ? { recovery_answer: recoveryAnswer } : {})
      })
    })
    setLoading(false)
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      setError(j.error || '인증 실패')
      setPin('')
      return
    }
    router.refresh()
  }

  const submitRecover = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!selected) return
    if (!recoveryAnswer.trim()) {
      setError('어머니 성함을 입력해주세요.')
      return
    }
    if (!/^\d{4,8}$/.test(pin)) {
      setError('새 PIN은 4자리 이상 숫자입니다.')
      return
    }
    if (pin !== pinConfirm) {
      setError('새 PIN 확인이 일치하지 않습니다.')
      return
    }
    setLoading(true)
    const r = await fetch('/api/member-auth/recover', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        member_id: selected.id,
        recovery_answer: recoveryAnswer,
        new_pin: pin
      })
    })
    setLoading(false)
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      setError(j.error || '재설정 실패')
      return
    }
    router.refresh()
  }

  /* ---------- 이름 선택 ---------- */
  if (step === 'select') {
    return (
      <section className="mb-8">
        <p className="mb-3 text-base text-gray-600">안녕하세요, 누구이신가요?</p>
        <div className="relative">
          <select
            value={selected?.id ?? ''}
            onChange={e => handleSelectChange(e.target.value)}
            disabled={loading}
            className="h-14 w-full appearance-none rounded-xl border border-gray-300 bg-white px-4 pr-12 text-lg font-medium outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
          >
            <option value="">이름을 선택하세요</option>
            {members.map(m => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-500" />
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </section>
    )
  }

  /* ---------- PIN 분실 → 재설정 ---------- */
  if (step === 'recover') {
    return (
      <section className="mb-8 space-y-4">
        <button
          type="button"
          onClick={() => {
            setStep('pin')
            setMode('verify')
            resetState()
          }}
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ChevronLeft className="h-4 w-4" />
          돌아가기
        </button>

        <div className="rounded-2xl border border-gray-200 bg-white p-5">
          <div className="text-xs text-gray-500">PIN 재설정</div>
          <div className="mt-0.5 text-2xl font-bold text-gray-900">{selected?.name}</div>
          <p className="mt-3 text-sm text-gray-700">
            처음 PIN 설정 시 입력하신 <strong>어머니 성함</strong>을 입력해주세요. 일치하면 새 PIN을 설정할 수 있습니다.
          </p>
        </div>

        <form onSubmit={submitRecover} className="space-y-4">
          <div>
            <Label htmlFor="recovery">어머니 성함</Label>
            <Input
              id="recovery"
              type="text"
              autoComplete="off"
              value={recoveryAnswer}
              onChange={e => setRecoveryAnswer(e.target.value)}
              placeholder="예: 김영희"
              className="mt-1"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="newpin">새 PIN 4자리</Label>
            <Input
              id="newpin"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="• • • •"
              className="mt-1 text-center text-2xl tracking-[0.4em]"
              maxLength={8}
            />
          </div>
          <div>
            <Label htmlFor="newpin2">새 PIN 다시 입력</Label>
            <Input
              id="newpin2"
              type="password"
              inputMode="numeric"
              autoComplete="new-password"
              value={pinConfirm}
              onChange={e => setPinConfirm(e.target.value.replace(/\D/g, ''))}
              placeholder="• • • •"
              className="mt-1 text-center text-2xl tracking-[0.4em]"
              maxLength={8}
            />
          </div>
          {error && <p className="text-sm font-medium text-red-600">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? '확인 중...' : 'PIN 재설정'}
          </Button>
          <p className="text-center text-xs text-gray-500">
            어머니 성함을 잊으셨다면 운영자에게 요청해주세요.
          </p>
        </form>
      </section>
    )
  }

  /* ---------- PIN 입력 / 설정 ---------- */
  return (
    <section className="mb-8 space-y-4">
      <button
        type="button"
        onClick={() => {
          setStep('select')
          setSelected(null)
          resetState()
        }}
        className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ChevronLeft className="h-4 w-4" />
        이름 다시 선택
      </button>

      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="text-xs text-gray-500">선택한 이름</div>
        <div className="mt-0.5 text-2xl font-bold text-gray-900">{selected?.name}</div>
        <p className="mt-3 text-sm text-gray-700">
          {mode === 'setup' ? (
            <>
              <span className="font-bold text-green-700">처음 접속하셨네요!</span> 사용하실 PIN
              4자리와 본인 확인용 어머니 성함을 입력해주세요.
            </>
          ) : (
            <>본인 확인을 위해 PIN을 입력해주세요.</>
          )}
        </p>
      </div>

      <form onSubmit={submitPin} className="space-y-4">
        <div>
          <Label htmlFor="pin">{mode === 'setup' ? 'PIN 4자리 (새로 만들기)' : 'PIN 입력'}</Label>
          <Input
            id="pin"
            type="password"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={pin}
            onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="• • • •"
            className="mt-1 text-center text-2xl tracking-[0.4em]"
            autoFocus
            maxLength={8}
          />
        </div>
        {mode === 'setup' && (
          <>
            <div>
              <Label htmlFor="pin2">PIN 다시 입력</Label>
              <Input
                id="pin2"
                type="password"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={pinConfirm}
                onChange={e => setPinConfirm(e.target.value.replace(/\D/g, ''))}
                placeholder="• • • •"
                className="mt-1 text-center text-2xl tracking-[0.4em]"
                maxLength={8}
              />
            </div>
            <div>
              <Label htmlFor="recovery-setup">어머니 성함 (PIN 분실 시 본인 확인용)</Label>
              <Input
                id="recovery-setup"
                type="text"
                autoComplete="off"
                value={recoveryAnswer}
                onChange={e => setRecoveryAnswer(e.target.value)}
                placeholder="예: 김영희"
                className="mt-1"
              />
              <p className="mt-1 text-xs text-gray-500">
                나만 정확히 답할 수 있는 정보입니다. 다른 분이 알기 어려운 본명으로 입력해주세요.
              </p>
            </div>
          </>
        )}
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={pin.length < 4 || loading}>
          {loading ? '확인 중...' : mode === 'setup' ? 'PIN 만들기' : '입장'}
        </Button>
        {mode === 'verify' && (
          <button
            type="button"
            onClick={() => {
              setStep('recover')
              resetState()
            }}
            className="block w-full text-center text-sm text-blue-600 hover:underline"
          >
            PIN을 잊으셨나요?
          </button>
        )}
      </form>
    </section>
  )
}
