import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { supabaseAdmin } from '@/lib/supabase/server'
import {
  PRE_ATTENDANCE_CUTOFF_MINUTES,
  formatMinutesKR,
  seoulHourMinute
} from '@/lib/seoul-time'
import { CopyShareButtons } from '@/components/CopyShareButtons'
import type { Member, Session } from '@/lib/types'
import { CopyNamesButton } from './copy-names-button'

export const revalidate = 0

const APP_URL = process.env.NEXT_PUBLIC_SITE_URL ?? ''
const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토']

function formatDateKR(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  if (!y) return d
  const dt = new Date(Date.UTC(y, m - 1, day))
  return `${m}월 ${day}일 (${WEEKDAY[dt.getUTCDay()]})`
}

function formatTimeKR(iso: string | null) {
  if (!iso) return null
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return null
  const { hour, minute } = seoulHourMinute(t)
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

type PreAttendanceRow = {
  member_id: string
  status: 'attending' | 'absent'
  reason: string | null
  responded_at: string | null
}

type Entry = { id: string; name: string; time: string | null; reason: string | null }

export default async function SessionPreAttendancePage({
  params
}: {
  params: { sessionId: string }
}) {
  let session: Session | null = null
  let members: Member[] = []
  let pre: PreAttendanceRow[] = []
  let envError: string | null = null

  try {
    const supabase = supabaseAdmin()
    const { data: s, error: sErr } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', params.sessionId)
      .maybeSingle()
    if (sErr) throw new Error(sErr.message)
    session = s

    if (session) {
      const [mRes, pRes] = await Promise.all([
        supabase.from('members').select('*').eq('is_active', true).order('name'),
        supabase
          .from('pre_attendances')
          .select('member_id, status, reason, responded_at')
          .eq('session_id', session.id)
      ])
      members = mRes.data ?? []
      pre = (pRes.data as PreAttendanceRow[]) ?? []
    }
  } catch (e) {
    envError = e instanceof Error ? e.message : '데이터 로드 실패'
  }

  if (!envError && !session) notFound()

  const preMap = new Map(pre.map(p => [p.member_id, p]))
  const attending: Entry[] = []
  const absent: Entry[] = []
  const noResponse: Entry[] = []

  // members는 이미 name 정렬(가나다순)이므로 분류 순서가 그대로 유지됨
  for (const m of members) {
    const p = preMap.get(m.id)
    const entry: Entry = {
      id: m.id,
      name: m.name,
      time: formatTimeKR(p?.responded_at ?? null),
      reason: p?.reason ?? null
    }
    if (!p) noResponse.push(entry)
    else if (p.status === 'attending') attending.push(entry)
    else absent.push(entry)
  }

  const noResponseNames = noResponse.map(e => e.name)
  const urlLine = APP_URL ? `\n👉 ${APP_URL}/attendance` : ''
  const reminderMessage = session
    ? [
        '종가투 형님들 안녕하세요 🙏',
        '',
        `${formatDateKR(session.date)} 스터디 사전참석 답변 부탁드립니다.`,
        '',
        `아직 ${noResponse.length}명 답변 대기 중입니다:`,
        noResponseNames.join(', '),
        '',
        `답변 마감: ${formatDateKR(session.date)} ${formatMinutesKR(PRE_ATTENDANCE_CUTOFF_MINUTES)} (스터디 10분 전)${urlLine}`
      ].join('\n')
    : ''

  return (
    <div>
      <Link
        href="/admin"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ChevronLeft className="h-4 w-4" /> 관리자 홈
      </Link>

      {envError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {envError}
        </div>
      ) : (
        session && (
          <>
            <div className="mb-6">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <span>{session.session_number}회차</span>
                {session.is_test && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-800">
                    🧪 테스트
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-bold">{formatDateKR(session.date)} 사전참석</h1>
              <p className="mt-1 text-base text-gray-600">활성 {members.length}명 기준</p>
            </div>

            <div className="space-y-4">
              <Group
                title="참석"
                icon="✅"
                entries={attending}
                boxCls="border-green-200 bg-green-50"
                titleCls="text-green-800"
              />
              <Group
                title="불참"
                icon="❌"
                entries={absent}
                boxCls="border-red-200 bg-red-50"
                titleCls="text-red-800"
                showReason
              />
              <Group
                title="미응답"
                icon="⏳"
                entries={noResponse}
                boxCls="border-amber-200 bg-amber-50"
                titleCls="text-amber-900"
              />
            </div>

            {noResponse.length > 0 && (
              <section className="mt-4 rounded-2xl border border-gray-200 bg-white p-4">
                <div className="text-base font-bold text-gray-900">📢 재안내 메시지</div>
                <p className="mt-1 text-sm text-gray-600">단톡방에 복사해 보내주세요.</p>
                <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-sm leading-relaxed text-gray-800">
{reminderMessage}
                </pre>
                <CopyShareButtons message={reminderMessage} shareTitle="종가투 사전참석 재안내" />
                <CopyNamesButton names={noResponseNames} />
              </section>
            )}
          </>
        )
      )}
    </div>
  )
}

function Group({
  title,
  icon,
  entries,
  boxCls,
  titleCls,
  showReason = false
}: {
  title: string
  icon: string
  entries: Entry[]
  boxCls: string
  titleCls: string
  showReason?: boolean
}) {
  return (
    <section className={`rounded-2xl border p-4 ${boxCls}`}>
      <div className={`text-base font-bold ${titleCls}`}>
        {icon} {title} ({entries.length}명)
      </div>
      {entries.length === 0 ? (
        <p className="mt-2 text-base text-gray-500">(없음)</p>
      ) : (
        <ul className="mt-2 divide-y divide-white/70">
          {entries.map(e => (
            <li key={e.id} className="flex items-baseline justify-between gap-3 py-2">
              <span className="text-lg font-semibold text-gray-900">
                {e.name}
                {showReason && e.reason && (
                  <span className="ml-2 text-sm font-normal text-gray-600">({e.reason})</span>
                )}
              </span>
              {e.time && <span className="shrink-0 text-sm text-gray-500">{e.time} 답변</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
