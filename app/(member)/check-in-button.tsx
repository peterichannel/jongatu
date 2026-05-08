'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function CheckInButton({ sessionId }: { sessionId: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [, startTransition] = useTransition()
  const [error, setError] = useState('')

  const handleClick = async () => {
    setError('')
    setPending(true)
    const r = await fetch('/api/attendance/check-in', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId })
    })
    const j = await r.json().catch(() => ({}))
    setPending(false)
    if (!r.ok) {
      setError(j.error || '체크인 실패')
      return
    }
    startTransition(() => router.refresh())
  }

  return (
    <>
      <Button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="h-14 w-full bg-amber-600 text-base font-bold hover:bg-amber-700"
      >
        {pending ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" /> 체크 중...
          </>
        ) : (
          <>
            <CheckCircle2 className="h-5 w-5" /> 출석 체크
          </>
        )}
      </Button>
      {error && (
        <p className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-800">{error}</p>
      )}
    </>
  )
}
