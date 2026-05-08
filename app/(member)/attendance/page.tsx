import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getAuthedMember } from '@/lib/member-auth'
import type { Member, Presentation, Session } from '@/lib/types'
import { AttendanceResponse } from './attendance-response'

export const revalidate = 0

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

export default async function AttendancePage() {
  const me = await getAuthedMember()
  if (!me) {
    return (
      <main className="flex-1 px-5 py-6">
        <h1 className="mb-6 text-2xl font-bold">출결</h1>
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-base font-semibold text-amber-900">로그인이 필요합니다</p>
            <p className="mt-1 text-sm text-amber-800">
              홈에서 본인 이름을 선택하고 PIN을 입력하시면 출결 응답이 가능합니다.
            </p>
          </div>
          <Link href="/">
            <Button className="w-full">홈으로</Button>
          </Link>
        </div>
      </main>
    )
  }

  let envError: string | null = null
  let nextSession: Session | null = null
  let presentations: Presentation[] = []
  let members: Member[] = []

  try {
    const supabase = supabaseAdmin()
    const { data: q } = await supabase
      .from('quarters')
      .select('id')
      .eq('is_active', true)
      .maybeSingle()

    if (q) {
      const { data: ns } = await supabase
        .from('sessions')
        .select('*')
        .eq('quarter_id', q.id)
        .eq('type', 'normal')
        .gte('date', todayISO())
        .order('date', { ascending: true })
        .limit(1)
        .maybeSingle()
      nextSession = ns

      if (nextSession) {
        const { data: pres } = await supabase
          .from('presentations')
          .select('*')
          .eq('session_id', nextSession.id)
          .order('slot')
        presentations = pres ?? []
      }
    }

    const { data: mems } = await supabase
      .from('members')
      .select('*')
      .eq('is_active', true)
      .order('name')
    members = mems ?? []
  } catch (e) {
    envError = e instanceof Error ? e.message : '데이터 로드 실패'
  }

  return (
    <main className="flex-1 px-5 py-6">
      <h1 className="mb-6 text-2xl font-bold">출결</h1>

      {envError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {envError}
        </div>
      ) : !nextSession ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <p className="text-base font-semibold text-amber-900">다가오는 회차가 없습니다</p>
          <p className="mt-1 text-sm text-amber-800">
            운영자가 분기 일정을 등록할 때까지 기다려주세요.
          </p>
        </div>
      ) : (
        <AttendanceResponse
          me={me}
          session={nextSession}
          presentations={presentations}
          members={members}
        />
      )}
    </main>
  )
}
