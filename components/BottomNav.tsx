'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Calendar, ClipboardCheck, Star, User } from 'lucide-react'
import { cn } from '@/lib/utils'

const items = [
  { href: '/', label: '홈', icon: Home },
  { href: '/schedule', label: '일정', icon: Calendar },
  { href: '/attendance', label: '출결', icon: ClipboardCheck },
  { href: '/evaluation', label: '평가', icon: Star },
  { href: '/me', label: '내정보', icon: User }
]

export function BottomNav() {
  const pathname = usePathname()
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-[430px] border-t border-gray-200 bg-white"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {items.map(item => {
        const Icon = item.icon
        const active = pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-1 py-3',
              active ? 'text-green-600' : 'text-gray-500'
            )}
          >
            <Icon className="h-6 w-6" strokeWidth={active ? 2.5 : 2} />
            <span className={cn('text-sm', active && 'font-bold')}>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
