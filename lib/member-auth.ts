import bcrypt from 'bcryptjs'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { MEMBER_AUTH_COOKIE, MEMBER_COOKIE } from './constants'
import { supabaseAdmin } from './supabase/server'
import type { Member } from './types'

const COOKIE_OPTIONS = {
  httpOnly: false, // 클라이언트도 읽음 (선택 시 자동 매칭용)
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 60 * 60 * 24 * 365, // 1년
  path: '/'
}

const AUTH_COOKIE_OPTIONS = {
  httpOnly: true, // server에서만 사용
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 60 * 60 * 24 * 365,
  path: '/'
}

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, 10)
}

export async function comparePin(pin: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(pin, hash)
  } catch {
    return false
  }
}

// 본인 확인 답변(어머니 성함) 정규화: 양끝 공백 제거 + 내부 공백 제거 + 소문자
// 예: "  김 영희 " === "김영희" === "김영희"
export function normalizeRecoveryAnswer(s: string): string {
  return s.normalize('NFKC').replace(/\s+/g, '').toLowerCase()
}

export function setMemberCookies(memberId: string, pinHash: string) {
  const store = cookies()
  store.set(MEMBER_COOKIE, memberId, COOKIE_OPTIONS)
  store.set(MEMBER_AUTH_COOKIE, pinHash, AUTH_COOKIE_OPTIONS)
}

export function clearMemberCookies() {
  const store = cookies()
  store.delete(MEMBER_COOKIE)
  store.delete(MEMBER_AUTH_COOKIE)
}

// cache(): 같은 요청 안에서 layout/page 등이 여러 번 불러도 members 조회는 1회만 수행
export const getAuthedMember = cache(async (): Promise<Member | null> => {
  const store = cookies()
  const memberId = store.get(MEMBER_COOKIE)?.value
  const auth = store.get(MEMBER_AUTH_COOKIE)?.value
  if (!memberId || !auth) return null

  const supabase = supabaseAdmin()
  const { data } = await supabase
    .from('members')
    .select('*')
    .eq('id', memberId)
    .eq('is_active', true)
    .maybeSingle()
  if (!data || !data.pin_hash) return null
  if (data.pin_hash !== auth) return null
  return data as Member
})

export const getAuthedAdmin = cache(async (): Promise<Member | null> => {
  const me = await getAuthedMember()
  if (!me || !me.is_admin) return null
  return me
})
