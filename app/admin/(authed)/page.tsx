import Link from 'next/link'
import {
  Users,
  Calendar,
  DollarSign,
  Star,
  ArrowRight,
  ClipboardList,
  CalendarCheck
} from 'lucide-react'
import { supabaseAdmin } from '@/lib/supabase/server'
import { seoulDateISO } from '@/lib/seoul-time'

export const revalidate = 0

const tiles = [
  { href: '/admin/members', label: '스터디원', icon: Users, desc: '명단 관리', enabled: true },
  { href: '/admin/schedule', label: '일정', icon: Calendar, desc: '분기/회차/발표', enabled: true },
  { href: '/admin/finance', label: '정산', icon: DollarSign, desc: '보증금/운영비', enabled: true },
  { href: '/admin/evaluations', label: '평가 결과', icon: Star, desc: '발표 평가 모음', enabled: true }
] as const

export default async function AdminHome() {
  let preCounts: { attending: number; absent: number; no_response: number } | null = null
  let attCounts: {
    present: number
    late: number
    absent: number
    excused: number
    unchecked: number
  } | null = null
  let nextSession: { id: string; date: string; session_number: number } | null = null
  let todaySession: { id: string; date: string; session_number: number } | null = null
  let activeMemberCount = 0

  try {
    const supabase = supabaseAdmin()
    const NONE = Promise.resolve({ data: null })

    // ── 1파: 활성 멤버 수 + 활성 분기 (서로 독립)
    const [countRes, quarterRes] = await Promise.all([
      supabase.from('members').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('quarters').select('id').eq('is_active', true).maybeSingle()
    ])
    activeMemberCount = countRes.count ?? 0
    const q = quarterRes.data

    if (q) {
      const today = seoulDateISO()
      const sessionsOf = () =>
        supabase
          .from('sessions')
          .select('id, date, session_number')
          .eq('quarter_id', q.id)
          .eq('type', 'normal')

      // ── 2파: 오늘 회차 + 다음 회차
      const [todayRes, nextRes] = await Promise.all([
        sessionsOf().eq('date', today).maybeSingle(),
        sessionsOf().gte('date', today).order('date', { ascending: true }).limit(1).maybeSingle()
      ])
      todaySession = todayRes.data ?? null
      nextSession = nextRes.data ?? null

      // ── 3파: 사전참석 집계 + 오늘 출석 집계
      const [preRes, attRes] = await Promise.all([
        nextSession
          ? supabase
              .from('pre_attendances')
              .select('member_id, status')
              .eq('session_id', nextSession.id)
          : NONE,
        todaySession
          ? supabase
              .from('attendances')
              .select('member_id, status')
              .eq('session_id', todaySession.id)
          : NONE
      ])

      if (nextSession) {
        const respondedIds = new Set<string>()
        let attending = 0
        let absent = 0
        for (const p of (preRes.data ?? []) as { member_id: string; status: string }[]) {
          respondedIds.add(p.member_id)
          if (p.status === 'attending') attending += 1
          else absent += 1
        }
        preCounts = {
          attending,
          absent,
          no_response: Math.max(activeMemberCount - respondedIds.size, 0)
        }
      }

      if (todaySession) {
        const counts = { present: 0, late: 0, absent: 0, excused: 0 }
        const checkedIds = new Set<string>()
        for (const a of (attRes.data ?? []) as { member_id: string; status: string }[]) {
          const k = a.status as keyof typeof counts
          if (k in counts) counts[k] += 1
          checkedIds.add(a.member_id)
        }
        attCounts = {
          ...counts,
          unchecked: Math.max(activeMemberCount - checkedIds.size, 0)
        }
      }
    }
  } catch {
    // 비치명적
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold">관리자 홈</h1>
      <p className="mb-6 text-base text-gray-600">필요한 메뉴를 선택하세요.</p>

      {(preCounts && nextSession) || (attCounts && todaySession) ? (
        <div className="mb-6 space-y-3">
          {preCounts && nextSession && (
            <section className="rounded-2xl border border-gray-200 bg-white p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
                  <ClipboardList className="h-4 w-4" />
                  사전참석 — {nextSession.session_number}회차 ({nextSession.date})
                </div>
                <span className="text-xs text-gray-500">활성 {activeMemberCount}명</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="참석" value={preCounts.attending} color="text-green-700" />
                <Stat label="불참" value={preCounts.absent} color="text-red-700" />
                <Stat label="미응답" value={preCounts.no_response} color="text-amber-700" />
              </div>
            </section>
          )}
          {attCounts && todaySession && (
            <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-bold text-amber-900">
                  <CalendarCheck className="h-4 w-4" />
                  오늘 출석 — {todaySession.session_number}회차
                </div>
                <Link
                  href={`/admin/schedule/${todaySession.id}/attendance`}
                  className="text-xs font-semibold text-blue-700 hover:underline"
                >
                  상세 →
                </Link>
              </div>
              <div className="grid grid-cols-5 gap-2 text-center">
                <Stat label="출석" value={attCounts.present} color="text-green-700" />
                <Stat label="지각" value={attCounts.late} color="text-amber-700" />
                <Stat label="결석" value={attCounts.absent} color="text-red-700" />
                <Stat label="공결" value={attCounts.excused} color="text-gray-700" />
                <Stat label="미체크" value={attCounts.unchecked} color="text-gray-400" />
              </div>
            </section>
          )}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4">
        {tiles.map(t => {
          const Icon = t.icon
          const inner = (
            <div
              className={`flex h-32 flex-col justify-between rounded-2xl border p-4 transition ${
                t.enabled
                  ? 'border-gray-200 bg-white hover:border-green-600 hover:shadow-sm'
                  : 'border-gray-200 bg-gray-100 text-gray-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <Icon className="h-7 w-7" />
                {t.enabled && <ArrowRight className="h-4 w-4 text-gray-400" />}
              </div>
              <div>
                <div className="text-lg font-bold">{t.label}</div>
                <div className="text-sm text-gray-500">{t.desc}</div>
              </div>
            </div>
          )
          return t.enabled ? (
            <Link key={t.href} href={t.href}>
              {inner}
            </Link>
          ) : (
            <div key={t.href}>{inner}</div>
          )
        })}
      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
    </div>
  )
}
