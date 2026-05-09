import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getAuthedMember } from '@/lib/member-auth'
import { Button } from '@/components/ui/button'
import { seoulDateISO } from '@/lib/seoul-time'
import type { Member, Presentation, Session } from '@/lib/types'
import { EvaluationForm } from './evaluation-form'

export const revalidate = 0

export default async function EvaluationPage() {
  const me = await getAuthedMember()
  if (!me) {
    return (
      <main className="flex-1 px-5 py-6">
        <h1 className="mb-6 text-2xl font-bold">발표 평가</h1>
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-base font-semibold text-amber-900">로그인이 필요합니다</p>
            <p className="mt-1 text-sm text-amber-800">
              홈에서 본인 이름을 선택하고 PIN을 입력해주세요.
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
  let session: Session | null = null
  let presentations: Presentation[] = []
  let members: Member[] = []

  try {
    const supabase = supabaseAdmin()
    const { data: q, error: qErr } = await supabase
      .from('quarters')
      .select('id')
      .eq('is_active', true)
      .maybeSingle()
    if (qErr) throw new Error(qErr.message)

    if (q) {
      const today = seoulDateISO()
      const { data: recents, error: sErr } = await supabase
        .from('sessions')
        .select('*, presentations(id)')
        .eq('quarter_id', q.id)
        .eq('type', 'normal')
        .lte('date', today)
        .order('date', { ascending: false })
        .limit(5)
      if (sErr) throw new Error(sErr.message)
      const withPres = (recents ?? []).find(
        (s: { presentations: { id: string }[] }) => s.presentations.length > 0
      )
      session = (withPres as Session | null) ?? null

      if (session) {
        const { data: pres } = await supabase
          .from('presentations')
          .select('*')
          .eq('session_id', session.id)
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
      <h1 className="mb-6 text-2xl font-bold">발표 평가</h1>

      {envError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {envError}
        </div>
      ) : !session || presentations.length === 0 ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <p className="text-base font-semibold text-amber-900">평가할 발표가 없습니다</p>
            <p className="mt-1 text-sm text-amber-800">
              스터디가 끝난 후 발표 평가가 가능합니다.
            </p>
          </div>
          <Link href="/">
            <Button variant="outline" className="w-full">
              홈으로
            </Button>
          </Link>
        </div>
      ) : (
        <EvaluationForm
          me={me}
          session={session}
          presentations={presentations}
          members={members}
        />
      )}
    </main>
  )
}
