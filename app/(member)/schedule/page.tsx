import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getAuthedMember } from '@/lib/member-auth'
import { Button } from '@/components/ui/button'
import type { Member, Presentation, Quarter, Session } from '@/lib/types'
import { ScheduleView } from './schedule-view'

export const revalidate = 0
export const dynamic = 'force-dynamic'

export default async function SchedulePage({
  searchParams
}: {
  searchParams: { quarter?: string }
}) {
  const me = await getAuthedMember()

  if (!me) {
    return (
      <main className="flex-1 px-5 py-6">
        <h1 className="mb-6 text-2xl font-bold">일정</h1>
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-base font-semibold text-amber-900">로그인이 필요합니다</p>
            <p className="mt-1 text-sm text-amber-800">
              홈에서 본인 이름 선택 후 PIN을 입력해주세요.
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
  let quarters: Quarter[] = []
  let targetQuarter: Quarter | null = null
  let sessions: Session[] = []
  let presentations: Presentation[] = []
  let members: Member[] = []

  try {
    const supabase = supabaseAdmin()
    const { data: qs, error: qErr } = await supabase
      .from('quarters')
      .select('*')
      .order('start_date', { ascending: false })
    if (qErr) throw new Error(qErr.message)
    quarters = qs ?? []

    const requested = searchParams.quarter
    targetQuarter =
      (requested && quarters.find(q => q.id === requested)) ||
      quarters.find(q => q.is_active) ||
      quarters[0] ||
      null

    if (targetQuarter) {
      let sesQuery = supabase
        .from('sessions')
        .select('*')
        .eq('quarter_id', targetQuarter.id)
      if (!me.is_admin) sesQuery = sesQuery.eq('is_test', false)
      const { data: ses, error: sErr } = await sesQuery.order('session_number', { ascending: true })
      if (sErr) throw new Error(sErr.message)
      sessions = ses ?? []

      if (sessions.length > 0) {
        const sessionIds = sessions.map(s => s.id)
        const { data: pres, error: pErr } = await supabase
          .from('presentations')
          .select('*')
          .in('session_id', sessionIds)
          .order('slot', { ascending: true })
        if (pErr) throw new Error(pErr.message)
        presentations = pres ?? []
      }
    }

    const { data: mems, error: mErr } = await supabase
      .from('members')
      .select('id, name, is_active')
      .order('name')
    if (mErr) throw new Error(mErr.message)
    members = (mems ?? []) as Member[]
  } catch (e) {
    envError = e instanceof Error ? e.message : '데이터 로드 실패'
  }

  if (envError) {
    return (
      <main className="flex-1 px-5 py-6">
        <h1 className="mb-6 text-2xl font-bold">일정</h1>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {envError}
        </div>
      </main>
    )
  }

  if (!targetQuarter) {
    return (
      <main className="flex-1 px-5 py-6">
        <h1 className="mb-6 text-2xl font-bold">일정</h1>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          등록된 분기가 없습니다. 운영자가 분기를 등록할 때까지 기다려주세요.
        </div>
      </main>
    )
  }

  return (
    <main className="flex-1 px-5 py-6">
      <h1 className="mb-1 text-2xl font-bold">일정</h1>
      <p className="mb-5 text-sm text-gray-500">{me.name}님</p>

      <ScheduleView
        me={me}
        quarters={quarters}
        targetQuarter={targetQuarter}
        sessions={sessions}
        presentations={presentations}
        members={members}
      />
    </main>
  )
}
