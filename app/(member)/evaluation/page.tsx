import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase/server'
import { getAuthedMember } from '@/lib/member-auth'
import { Button } from '@/components/ui/button'
import { canEvaluateAttendance, isEvaluationOpen, seoulDateISO } from '@/lib/seoul-time'
import type { Member, Presentation, Session } from '@/lib/types'
import { EvaluationForm } from './evaluation-form'

export const revalidate = 0

export default async function EvaluationPage() {
  let me: Member | null = null
  let envError: string | null = null
  let session: Session | null = null
  let presentations: Presentation[] = []
  let members: Member[] = []
  let myAttendanceStatus: string | null = null

  try {
    const supabase = supabaseAdmin()

    // ── 1파: 인증 + 활성 분기 + 명단 (서로 독립)
    const [meRes, quarterRes, membersRes] = await Promise.all([
      getAuthedMember(),
      supabase.from('quarters').select('id').eq('is_active', true).maybeSingle(),
      supabase.from('members').select('*').eq('is_active', true).order('name')
    ])
    if (quarterRes.error) throw new Error(quarterRes.error.message)
    me = meRes
    members = membersRes.data ?? []
    const q = quarterRes.data

    if (me && q) {
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
      // 발표가 있고 + 스터디 종료(21:00 KST 이후)된 가장 최근 회차
      const withPres = (recents ?? []).find(
        (s: { date: string; presentations: { id: string }[] }) =>
          s.presentations.length > 0 && isEvaluationOpen(s.date)
      )
      session = (withPres as Session | null) ?? null

      if (session) {
        const [presRes, attRes] = await Promise.all([
          supabase
            .from('presentations')
            .select('*')
            .eq('session_id', session.id)
            .order('slot'),
          supabase
            .from('attendances')
            .select('status')
            .eq('session_id', session.id)
            .eq('member_id', me.id)
            .maybeSingle()
        ])
        presentations = presRes.data ?? []
        myAttendanceStatus = (attRes.data as { status: string } | null)?.status ?? null
      }
    }
  } catch (e) {
    envError = e instanceof Error ? e.message : '데이터 로드 실패'
  }

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
      ) : !canEvaluateAttendance(myAttendanceStatus) ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <p className="text-base font-semibold text-gray-900">
              출석 정보가 없어 평가할 수 없습니다
            </p>
            <p className="mt-1 text-sm text-gray-600">
              발표 평가는 해당 회차에 <b>출석·지각</b>한 회원만 가능합니다.
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
