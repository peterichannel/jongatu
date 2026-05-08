import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { supabaseAdmin } from '@/lib/supabase/server'
import { formatKRW } from '@/lib/utils'
import { PrintButton } from './print-button'

export const revalidate = 0

const ATTENDANCE_LABEL = {
  present: '출석',
  late: '지각',
  absent: '결석',
  excused: '공결'
} as const

const CATEGORY_LABEL: Record<string, string> = {
  studyroom: '스터디룸',
  meal: '식사',
  snack: '간식',
  gift: '선물',
  penalty: '페널티',
  membership: '회비',
  other: '기타'
}

const CATEGORY_ORDER = ['membership', 'penalty', 'studyroom', 'meal', 'snack', 'gift', 'other']

export default async function FinanceReportPage() {
  const supabase = supabaseAdmin()
  let envError: string | null = null

  try {
    const { data: q, error: qErr } = await supabase
      .from('quarters')
      .select('*')
      .eq('is_active', true)
      .maybeSingle()
    if (qErr) throw new Error(qErr.message)
    if (!q) {
      return (
        <div>
          <Link
            href="/admin/finance"
            className="mb-4 inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 print:hidden"
          >
            <ChevronLeft className="h-4 w-4" /> 정산
          </Link>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            활성 분기가 없습니다.
          </div>
        </div>
      )
    }

    const [
      { data: members },
      { data: deposits },
      { data: depositTx },
      { data: fundTx },
      { data: sessions },
      { data: presentations },
      { data: attendances },
      { data: evaluations }
    ] = await Promise.all([
      supabase.from('members').select('*').order('name'),
      supabase.from('deposits').select('*').eq('quarter_id', q.id),
      supabase
        .from('deposit_transactions')
        .select('id, deposit_id, amount, reason, created_at')
        .order('created_at', { ascending: true }),
      supabase
        .from('fund_transactions')
        .select('*')
        .eq('quarter_id', q.id)
        .order('date', { ascending: true }),
      supabase
        .from('sessions')
        .select('*')
        .eq('quarter_id', q.id)
        .order('session_number'),
      supabase.from('presentations').select('*'),
      supabase.from('attendances').select('*'),
      supabase.from('evaluations').select('*')
    ])

    const allMembers = members ?? []
    const allDeposits = deposits ?? []
    const sessionsArr = sessions ?? []
    const sessionIds = new Set(sessionsArr.map(s => s.id))
    const presArr = (presentations ?? []).filter(p => sessionIds.has(p.session_id))
    const attsArr = (attendances ?? []).filter(a => sessionIds.has(a.session_id))
    const evalsArr = (evaluations ?? []).filter(e => sessionIds.has(e.session_id))

    const depositByMember = new Map<string, (typeof allDeposits)[number]>()
    for (const d of allDeposits) depositByMember.set(d.member_id, d)

    const depositTxByDeposit = new Map<string, { reason: string; amount: number }[]>()
    for (const t of depositTx ?? []) {
      const arr = depositTxByDeposit.get(t.deposit_id) ?? []
      arr.push({ reason: t.reason, amount: t.amount })
      depositTxByDeposit.set(t.deposit_id, arr)
    }

    type MemberRow = {
      memberId: string
      name: string
      isActive: boolean
      initial: number
      balance: number
      diff: number
      counts: { absent: number; late: number; no_pre: number; no_present: number }
      attendance: { present: number; late: number; absent: number; excused: number }
      presentationsCount: number
      avgScore: number | null
      // 다음 분기 신청금액
      nextOperating: number
      nextDeposit: number
      nextApplication: number
      nextRefund: number
    }

    const rows: MemberRow[] = []
    for (const m of allMembers) {
      const d = depositByMember.get(m.id)
      const initial = d?.initial_amount ?? q.default_deposit
      const balance = d?.current_balance ?? q.default_deposit
      const txs = d ? depositTxByDeposit.get(d.id) ?? [] : []
      const counts = { absent: 0, late: 0, no_pre: 0, no_present: 0 }
      for (const t of txs) {
        if (t.reason.includes('결석')) counts.absent += 1
        else if (t.reason.includes('지각')) counts.late += 1
        else if (t.reason.includes('사전참석')) counts.no_pre += 1
        else if (t.reason.includes('발표')) counts.no_present += 1
      }

      const memberAtts = attsArr.filter(a => a.member_id === m.id)
      const attendance = { present: 0, late: 0, absent: 0, excused: 0 }
      for (const a of memberAtts) {
        const k = a.status as keyof typeof attendance
        if (k in attendance) attendance[k] += 1
      }

      const memberPres = presArr.filter(p => p.presenter_id === m.id)
      const memberPresIds = new Set(memberPres.map(p => p.id))
      const memberEvals = evalsArr.filter(e => memberPresIds.has(e.presentation_id))
      const avgScore =
        memberEvals.length > 0
          ? memberEvals.reduce(
              (s, e) =>
                s +
                (e.preparation +
                  e.delivery +
                  e.qna +
                  e.time_management +
                  e.attractiveness) /
                  5,
              0
            ) / memberEvals.length
          : null

      // 다음 분기 신청금액 계산
      // 활성 멤버: (운영비 + 분기 보증금 목표) - 잔액 → 0 미만이면 환불(차액)
      // 탈퇴 멤버: 잔액 전액 환불
      const opFee = q.operating_fee ?? 30000
      const targetDeposit = q.default_deposit
      const target = opFee + targetDeposit
      let nextOperating = 0
      let nextDeposit = 0
      let nextApplication = 0
      let nextRefund = 0
      if (m.is_active) {
        nextOperating = opFee
        nextDeposit = targetDeposit
        const surplus = balance - target
        if (surplus >= 0) {
          nextApplication = 0
          nextRefund = surplus
        } else {
          nextApplication = -surplus
          nextRefund = 0
        }
      } else {
        nextRefund = balance > 0 ? balance : 0
      }

      rows.push({
        memberId: m.id,
        name: m.name,
        isActive: m.is_active,
        initial,
        balance,
        diff: balance - initial,
        counts,
        attendance,
        presentationsCount: memberPres.length,
        avgScore,
        nextOperating,
        nextDeposit,
        nextApplication,
        nextRefund
      })
    }

    const totalDeposits = rows.reduce((acc, r) => acc + r.balance, 0)
    const totalInitial = rows.reduce((acc, r) => acc + r.initial, 0)
    const totalDeducted = rows.reduce((acc, r) => acc + (r.balance < r.initial ? r.initial - r.balance : 0), 0)
    const totalNextOperating = rows.reduce((acc, r) => acc + r.nextOperating, 0)
    const totalNextDeposit = rows.reduce((acc, r) => acc + r.nextDeposit, 0)
    const totalNextApplication = rows.reduce((acc, r) => acc + r.nextApplication, 0)
    const totalNextRefund = rows.reduce((acc, r) => acc + r.nextRefund, 0)

    const fundByCategory = new Map<string, { income: number; expense: number }>()
    let fundIncome = 0
    let fundExpense = 0
    for (const t of fundTx ?? []) {
      const slot = fundByCategory.get(t.category) ?? { income: 0, expense: 0 }
      if (t.amount > 0) {
        slot.income += t.amount
        fundIncome += t.amount
      } else {
        slot.expense += t.amount
        fundExpense += t.amount
      }
      fundByCategory.set(t.category, slot)
    }

    const normalSessions = sessionsArr.filter(s => s.type === 'normal')

    return (
      <div>
        <div className="mb-4 flex items-center justify-between print:hidden">
          <Link
            href="/admin/finance"
            className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
          >
            <ChevronLeft className="h-4 w-4" /> 정산
          </Link>
          <PrintButton />
        </div>

        <div className="space-y-8 rounded-2xl border border-gray-200 bg-white p-6 print:rounded-none print:border-0 print:p-0">
          <header className="border-b border-gray-300 pb-4">
            <div className="text-xs text-gray-500">종로 가치 투자 스터디 (JVI)</div>
            <h1 className="mt-1 text-2xl font-bold">{q.name} 분기 정산서</h1>
            <div className="mt-1 text-sm text-gray-600">
              {q.start_date} ~ {q.end_date}
            </div>
          </header>

          {/* 분기 요약 */}
          <section className="page-keep">
            <h2 className="mb-3 text-lg font-bold">분기 요약</h2>
            <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <SummaryBox label="회차 수" value={`${normalSessions.length}회`} />
              <SummaryBox label="발표 수" value={`${presArr.length}건`} />
              <SummaryBox label="총 보증금 잔액" value={formatKRW(totalDeposits)} />
              <SummaryBox label="페널티 차감 합계" value={formatKRW(totalDeducted)} />
            </div>
          </section>

          {/* 보증금 정산표 */}
          <section className="page-keep">
            <h2 className="mb-3 text-lg font-bold">보증금 정산</h2>
            <table className="w-full text-sm">
              <thead className="bg-gray-100 text-left">
                <tr>
                  <th className="border border-gray-300 px-2 py-2">이름</th>
                  <th className="border border-gray-300 px-2 py-2 text-right">초기</th>
                  <th className="border border-gray-300 px-2 py-2 text-right">잔액</th>
                  <th className="border border-gray-300 px-2 py-2 text-right">차감</th>
                  <th className="border border-gray-300 px-2 py-2 text-center">결석</th>
                  <th className="border border-gray-300 px-2 py-2 text-center">지각</th>
                  <th className="border border-gray-300 px-2 py-2 text-center">사전미응답</th>
                  <th className="border border-gray-300 px-2 py-2 text-center">발표미수행</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr
                    key={r.memberId}
                    className={!r.isActive ? 'text-gray-400 line-through' : ''}
                  >
                    <td className="border border-gray-300 px-2 py-1.5">{r.name}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right">
                      {formatKRW(r.initial)}
                    </td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right font-semibold">
                      {formatKRW(r.balance)}
                    </td>
                    <td
                      className={`border border-gray-300 px-2 py-1.5 text-right ${
                        r.diff < 0 ? 'text-red-700' : ''
                      }`}
                    >
                      {r.diff !== 0 ? formatKRW(r.diff) : '-'}
                    </td>
                    <td className="border border-gray-300 px-2 py-1.5 text-center">
                      {r.counts.absent || '-'}
                    </td>
                    <td className="border border-gray-300 px-2 py-1.5 text-center">
                      {r.counts.late || '-'}
                    </td>
                    <td className="border border-gray-300 px-2 py-1.5 text-center">
                      {r.counts.no_pre || '-'}
                    </td>
                    <td className="border border-gray-300 px-2 py-1.5 text-center">
                      {r.counts.no_present || '-'}
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-bold">
                  <td className="border border-gray-300 px-2 py-1.5">합계</td>
                  <td className="border border-gray-300 px-2 py-1.5 text-right">
                    {formatKRW(totalInitial)}
                  </td>
                  <td className="border border-gray-300 px-2 py-1.5 text-right">
                    {formatKRW(totalDeposits)}
                  </td>
                  <td
                    className={`border border-gray-300 px-2 py-1.5 text-right ${
                      totalDeducted > 0 ? 'text-red-700' : ''
                    }`}
                  >
                    {totalDeducted > 0 ? `-${formatKRW(totalDeducted)}` : '-'}
                  </td>
                  <td className="border border-gray-300 px-2 py-1.5 text-center">-</td>
                  <td className="border border-gray-300 px-2 py-1.5 text-center">-</td>
                  <td className="border border-gray-300 px-2 py-1.5 text-center">-</td>
                  <td className="border border-gray-300 px-2 py-1.5 text-center">-</td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* 다음 분기 신청금액 */}
          <section className="page-keep">
            <h2 className="mb-1 text-lg font-bold">다음 분기 신청금액</h2>
            <p className="mb-3 text-xs text-gray-600">
              산출식: (운영비 {formatKRW(q.operating_fee ?? 30000)} + 보증금 {formatKRW(q.default_deposit)}) - 현재 잔액. 잔액이 더 많으면 환불.
            </p>
            <table className="w-full text-sm">
              <thead className="bg-gray-100 text-left">
                <tr>
                  <th className="border border-gray-300 px-2 py-2">이름</th>
                  <th className="border border-gray-300 px-2 py-2 text-right">운영비(A)</th>
                  <th className="border border-gray-300 px-2 py-2 text-right">보증금(B)</th>
                  <th className="border border-gray-300 px-2 py-2 text-right">잔액(D)</th>
                  <th className="border border-gray-300 px-2 py-2 text-right">신청 = A+B-D</th>
                  <th className="border border-gray-300 px-2 py-2 text-right">환불</th>
                  <th className="border border-gray-300 px-2 py-2 text-center">상태</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr
                    key={r.memberId}
                    className={!r.isActive ? 'text-gray-400' : ''}
                  >
                    <td className="border border-gray-300 px-2 py-1.5">
                      {r.name}
                      {!r.isActive && (
                        <span className="ml-1 text-xs text-red-600">(탈퇴)</span>
                      )}
                    </td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right">
                      {r.nextOperating > 0 ? formatKRW(r.nextOperating) : '-'}
                    </td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right">
                      {r.nextDeposit > 0 ? formatKRW(r.nextDeposit) : '-'}
                    </td>
                    <td className="border border-gray-300 px-2 py-1.5 text-right">
                      {formatKRW(r.balance)}
                    </td>
                    <td
                      className={`border border-gray-300 px-2 py-1.5 text-right font-semibold ${
                        r.nextApplication > 0 ? 'text-blue-700' : 'text-gray-400'
                      }`}
                    >
                      {r.nextApplication > 0 ? formatKRW(r.nextApplication) : '-'}
                    </td>
                    <td
                      className={`border border-gray-300 px-2 py-1.5 text-right ${
                        r.nextRefund > 0 ? 'text-red-700' : 'text-gray-400'
                      }`}
                    >
                      {r.nextRefund > 0 ? formatKRW(r.nextRefund) : '-'}
                    </td>
                    <td className="border border-gray-300 px-2 py-1.5 text-center text-xs">
                      {r.isActive
                        ? r.nextRefund > 0
                          ? '잔액 환불'
                          : r.nextApplication > 0
                            ? '신청 필요'
                            : '-'
                        : '환불 (탈퇴)'}
                    </td>
                  </tr>
                ))}
                <tr className="bg-gray-50 font-bold">
                  <td className="border border-gray-300 px-2 py-1.5">합계</td>
                  <td className="border border-gray-300 px-2 py-1.5 text-right">
                    {formatKRW(totalNextOperating)}
                  </td>
                  <td className="border border-gray-300 px-2 py-1.5 text-right">
                    {formatKRW(totalNextDeposit)}
                  </td>
                  <td className="border border-gray-300 px-2 py-1.5 text-right">
                    {formatKRW(totalDeposits)}
                  </td>
                  <td className="border border-gray-300 px-2 py-1.5 text-right text-blue-700">
                    {formatKRW(totalNextApplication)}
                  </td>
                  <td className="border border-gray-300 px-2 py-1.5 text-right text-red-700">
                    {formatKRW(totalNextRefund)}
                  </td>
                  <td className="border border-gray-300 px-2 py-1.5 text-center">-</td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* 운영비 정산 */}
          <section className="page-keep">
            <h2 className="mb-3 text-lg font-bold">운영비 정산</h2>
            <table className="w-full text-sm">
              <thead className="bg-gray-100 text-left">
                <tr>
                  <th className="border border-gray-300 px-2 py-2">카테고리</th>
                  <th className="border border-gray-300 px-2 py-2 text-right">입금</th>
                  <th className="border border-gray-300 px-2 py-2 text-right">지출</th>
                  <th className="border border-gray-300 px-2 py-2 text-right">소계</th>
                </tr>
              </thead>
              <tbody>
                {CATEGORY_ORDER.map(cat => {
                  const slot = fundByCategory.get(cat) ?? { income: 0, expense: 0 }
                  if (slot.income === 0 && slot.expense === 0) return null
                  return (
                    <tr key={cat}>
                      <td className="border border-gray-300 px-2 py-1.5">
                        {CATEGORY_LABEL[cat]}
                      </td>
                      <td className="border border-gray-300 px-2 py-1.5 text-right text-blue-700">
                        {slot.income > 0 ? formatKRW(slot.income) : '-'}
                      </td>
                      <td className="border border-gray-300 px-2 py-1.5 text-right text-red-700">
                        {slot.expense < 0 ? formatKRW(slot.expense) : '-'}
                      </td>
                      <td className="border border-gray-300 px-2 py-1.5 text-right">
                        {formatKRW(slot.income + slot.expense)}
                      </td>
                    </tr>
                  )
                })}
                <tr className="bg-gray-50 font-bold">
                  <td className="border border-gray-300 px-2 py-1.5">합계</td>
                  <td className="border border-gray-300 px-2 py-1.5 text-right">
                    {formatKRW(fundIncome)}
                  </td>
                  <td className="border border-gray-300 px-2 py-1.5 text-right">
                    {formatKRW(fundExpense)}
                  </td>
                  <td className="border border-gray-300 px-2 py-1.5 text-right">
                    {formatKRW(fundIncome + fundExpense)}
                  </td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* 출석/발표 통계 */}
          <section className="page-keep">
            <h2 className="mb-3 text-lg font-bold">출석 · 발표 통계</h2>
            <table className="w-full text-sm">
              <thead className="bg-gray-100 text-left">
                <tr>
                  <th className="border border-gray-300 px-2 py-2">이름</th>
                  {(Object.keys(ATTENDANCE_LABEL) as (keyof typeof ATTENDANCE_LABEL)[]).map(k => (
                    <th key={k} className="border border-gray-300 px-2 py-2 text-center">
                      {ATTENDANCE_LABEL[k]}
                    </th>
                  ))}
                  <th className="border border-gray-300 px-2 py-2 text-center">발표</th>
                  <th className="border border-gray-300 px-2 py-2 text-center">평균 평점</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr
                    key={r.memberId}
                    className={!r.isActive ? 'text-gray-400 line-through' : ''}
                  >
                    <td className="border border-gray-300 px-2 py-1.5">{r.name}</td>
                    <td className="border border-gray-300 px-2 py-1.5 text-center">
                      {r.attendance.present || '-'}
                    </td>
                    <td className="border border-gray-300 px-2 py-1.5 text-center">
                      {r.attendance.late || '-'}
                    </td>
                    <td className="border border-gray-300 px-2 py-1.5 text-center">
                      {r.attendance.absent || '-'}
                    </td>
                    <td className="border border-gray-300 px-2 py-1.5 text-center">
                      {r.attendance.excused || '-'}
                    </td>
                    <td className="border border-gray-300 px-2 py-1.5 text-center">
                      {r.presentationsCount || '-'}
                    </td>
                    <td className="border border-gray-300 px-2 py-1.5 text-center">
                      {r.avgScore ? r.avgScore.toFixed(2) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* 회차 목록 */}
          <section className="page-keep">
            <h2 className="mb-3 text-lg font-bold">회차 목록</h2>
            <table className="w-full text-sm">
              <thead className="bg-gray-100 text-left">
                <tr>
                  <th className="border border-gray-300 px-2 py-2">회차</th>
                  <th className="border border-gray-300 px-2 py-2">날짜</th>
                  <th className="border border-gray-300 px-2 py-2">유형</th>
                  <th className="border border-gray-300 px-2 py-2">메모</th>
                </tr>
              </thead>
              <tbody>
                {sessionsArr.map(s => (
                  <tr key={s.id}>
                    <td className="border border-gray-300 px-2 py-1.5">{s.session_number}</td>
                    <td className="border border-gray-300 px-2 py-1.5">{s.date}</td>
                    <td className="border border-gray-300 px-2 py-1.5">
                      {s.type === 'normal'
                        ? '정상'
                        : s.type === 'rest'
                          ? '휴강'
                          : s.type === 'dinner'
                            ? '식사'
                            : '친목'}
                    </td>
                    <td className="border border-gray-300 px-2 py-1.5">{s.note || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <footer className="border-t border-gray-300 pt-4 text-xs text-gray-500">
            출력일자: {new Date().toLocaleDateString('ko-KR')} · 운영자 이상호
          </footer>
        </div>

        <style>{`
          @media print {
            body { background: white !important; }
            .page-keep { page-break-inside: avoid; }
            @page { margin: 1.2cm; size: A4; }
          }
        `}</style>
      </div>
    )
  } catch (e) {
    envError = e instanceof Error ? e.message : '데이터 로드 실패'
    return (
      <div>
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {envError}
        </div>
      </div>
    )
  }
}

function SummaryBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-lg font-bold text-gray-900">{value}</div>
    </div>
  )
}
