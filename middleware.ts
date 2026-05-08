import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { MEMBER_AUTH_COOKIE, MEMBER_COOKIE } from '@/lib/constants'

const ONE_YEAR = 60 * 60 * 24 * 365

// 기본 동작:
//   1) cookie가 있으면 매 요청마다 만료일을 1년 뒤로 갱신 (sliding expiration → 사실상 영구 로그인)
//   2) /admin/* 와 /api/admin/* 는 추가로 멤버 cookie + is_admin 검증
//
// admin 검증은 Edge에서 Supabase REST를 직접 호출해 cookie의 pin_hash 와 일치하는 멤버의
// is_admin 플래그를 확인합니다.
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const memberId = request.cookies.get(MEMBER_COOKIE)?.value
  const memberAuth = request.cookies.get(MEMBER_AUTH_COOKIE)?.value

  const isAdminPath =
    pathname.startsWith('/admin') || pathname.startsWith('/api/admin')

  if (isAdminPath) {
    if (!memberId || !memberAuth) {
      return failResponse(request, 'unauth')
    }
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: 'server misconfigured' }, { status: 500 })
    }
    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/members?id=eq.${encodeURIComponent(memberId)}&select=pin_hash,is_admin,is_active&limit=1`,
        { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
      )
      if (!res.ok) throw new Error('member fetch failed')
      const rows = (await res.json()) as {
        pin_hash: string | null
        is_admin: boolean
        is_active: boolean
      }[]
      const member = rows[0]
      if (
        !member ||
        !member.is_active ||
        !member.pin_hash ||
        member.pin_hash !== memberAuth ||
        !member.is_admin
      ) {
        return failResponse(request, 'forbid')
      }
    } catch {
      return NextResponse.json({ error: 'auth check failed' }, { status: 500 })
    }
  }

  // sliding expiration: cookie를 새 응답에 다시 set 해서 만료일을 갱신
  const response = NextResponse.next()
  if (memberId && memberAuth) {
    const isProd = process.env.NODE_ENV === 'production'
    response.cookies.set(MEMBER_COOKIE, memberId, {
      httpOnly: false,
      sameSite: 'lax',
      secure: isProd,
      maxAge: ONE_YEAR,
      path: '/'
    })
    response.cookies.set(MEMBER_AUTH_COOKIE, memberAuth, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      maxAge: ONE_YEAR,
      path: '/'
    })
  }
  return response
}

function failResponse(request: NextRequest, kind: 'unauth' | 'forbid') {
  const { pathname } = request.nextUrl
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: kind === 'unauth' ? 'unauthorized' : 'forbidden' },
      { status: kind === 'unauth' ? 401 : 403 }
    )
  }
  const url = request.nextUrl.clone()
  url.pathname = '/'
  url.search = ''
  return NextResponse.redirect(url)
}

export const config = {
  // 정적 자원과 인증 API는 제외 (그 외 페이지/API에서 cookie 슬라이딩 동작)
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/member-auth).*)'
  ]
}
