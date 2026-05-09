'use client'

import { useState } from 'react'
import { Check, Copy, Share2 } from 'lucide-react'

export function CopyShareButtons({
  message,
  shareTitle,
  variant = 'normal'
}: {
  message: string
  shareTitle?: string
  variant?: 'normal' | 'danger'
}) {
  const [copied, setCopied] = useState(false)

  const writeClipboard = async (): Promise<boolean> => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message)
        return true
      }
    } catch {
      // fall through to legacy fallback
    }
    try {
      const ta = document.createElement('textarea')
      ta.value = message
      ta.setAttribute('readonly', '')
      ta.style.position = 'absolute'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      return ok
    } catch {
      return false
    }
  }

  const handleCopy = async () => {
    const ok = await writeClipboard()
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 5000)
    } else {
      alert('복사에 실패했습니다. 메시지를 길게 눌러 직접 복사해주세요.')
    }
  }

  const handleShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ text: message, title: shareTitle })
        return
      } catch {
        // user cancel or unsupported — fallback to copy
      }
    }
    await handleCopy()
  }

  const copyBtnCls =
    variant === 'danger'
      ? 'bg-red-600 hover:bg-red-700'
      : 'bg-gray-900 hover:bg-gray-800'

  return (
    <div className="mt-3 flex gap-2">
      <button
        type="button"
        onClick={handleCopy}
        className={`inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-xl text-base font-bold text-white transition ${copyBtnCls}`}
      >
        {copied ? (
          <>
            <Check className="h-5 w-5" /> 복사됨
          </>
        ) : (
          <>
            <Copy className="h-5 w-5" /> 복사하기
          </>
        )}
      </button>
      <button
        type="button"
        onClick={handleShare}
        className="inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 text-base font-bold text-white transition hover:bg-amber-600"
      >
        <Share2 className="h-5 w-5" /> 공유
      </button>
    </div>
  )
}
