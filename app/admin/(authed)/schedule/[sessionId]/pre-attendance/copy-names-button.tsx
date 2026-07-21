'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

export function CopyNamesButton({ names }: { names: string[] }) {
  const [copied, setCopied] = useState(false)
  const text = names.join(', ')

  const handleCopy = async () => {
    let ok = false
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
        ok = true
      }
    } catch {
      // fall through to legacy fallback
    }
    if (!ok) {
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        ta.setAttribute('readonly', '')
        ta.style.position = 'absolute'
        ta.style.left = '-9999px'
        document.body.appendChild(ta)
        ta.select()
        ok = document.execCommand('copy')
        document.body.removeChild(ta)
      } catch {
        ok = false
      }
    }
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 5000)
    } else {
      alert('복사에 실패했습니다. 이름을 길게 눌러 직접 복사해주세요.')
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={names.length === 0}
      className="mt-3 inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-gray-900 text-base font-bold text-white transition hover:bg-gray-800 disabled:opacity-40"
    >
      {copied ? (
        <>
          <Check className="h-5 w-5" /> 복사됨
        </>
      ) : (
        <>
          <Copy className="h-5 w-5" /> 이름만 복사
        </>
      )}
    </button>
  )
}
