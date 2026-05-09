import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatKRW(amount: number) {
  return new Intl.NumberFormat('ko-KR').format(amount) + '원'
}

export function formatDateKR(d: string | Date) {
  const date = typeof d === 'string' ? new Date(d) : d
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long', day: 'numeric', weekday: 'short'
  }).format(date)
}

// Asia/Seoul 기준 오늘 날짜. 단일 타임존 가정 — 다른 타임존이 필요하면 lib/seoul-time.ts 또는 직접 Intl.DateTimeFormat 사용.
export function todayISO() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date())
}
