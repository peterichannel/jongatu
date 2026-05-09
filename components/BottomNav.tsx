'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Home, Calendar, ClipboardCheck, Loader2, Star, User } from 'lucide-react'
import { cn } from '@/lib/utils'

const items = [
  { href: '/', label: '홈', icon: Home },
  { href: '/schedule', label: '일정', icon: Calendar },
  { href: '/attendance', label: '출결', icon: ClipboardCheck },
  { href: '/evaluation', label: '평가', icon: Star },
  { href: '/me', label: '내정보', icon: User }
]

export function BottomNav() {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()
  // 옵티미스틱 active: 클릭 즉시 시각 피드백을 위해 별도 추적 (실제 navigation 완료 전까지)
  const [pendingHref, setPendingHref] = useState<string | null>(null)

  // pathname 이 도착한 href 와 일치하면 옵티미스틱 상태 해제
  useEffect(() => {
    if (pendingHref && pathname === pendingHref) setPendingHref(null)
  }, [pathname, pendingHref])

  const handleNavigate = (href: string) => {
    if (href === pathname) return
    setPendingHref(href)
    startTransition(() => {
      router.push(href)
    })
  }

  const activeHref = pendingHref ?? pathname

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-[430px] border-t border-gray-200 bg-white"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {items.map(item => {
        const Icon = item.icon
        const active = activeHref === item.href
        const isLoading = isPending && pendingHref === item.href
        return (
          <button
            key={item.href}
            type="button"
            onClick={() => handleNavigate(item.href)}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-1 py-3 transition-colors',
              // 손가락 닿는 순간 즉각 시각 반응 (모든 탭 공통)
              'active:bg-gray-200',
              // 옵티미스틱 active: 이동 중인 탭 배경까지 채워서 "어디 누른지" 명확히
              active ? 'bg-green-50 text-green-700' : 'text-gray-500'
            )}
          >
            {isLoading ? (
              <Loader2
                className="h-6 w-6 animate-spin text-green-600"
                strokeWidth={2.5}
              />
            ) : (
              <Icon className="h-6 w-6" strokeWidth={active ? 2.5 : 2} />
            )}
            <span className={cn('text-sm', active && 'font-bold')}>{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
