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

export function todayISO() {
  return new Date().toISOString().slice(0, 10)
}
