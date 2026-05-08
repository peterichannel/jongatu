/**
 * 26년 상반기 출결/보증금/운영비 데이터 동기화 (v2 정책)
 *
 * 정책:
 *  - 보증금 시작 잔액: 활성 17명 전원 45,000원 (운영진 포함, 25년 잔액 무시)
 *  - 페널티: 결석 -10,000 / 지각 -3,000 (운영진도 정상 차감)
 *  - 운영비 입금: 일반 멤버 15명 × 45,000원 (양민기/이우재 면제)
 *  - 페널티 → 운영비 자동 전환 (동일 금액 입금)
 *
 * 매번 실행 가능 (멱등성): 2026-Q1, 2026-Q2 quarter 한정으로 v1 데이터 DELETE 후 v2 INSERT
 *
 * 실행: npm run sync:h1-2026
 */

import { loadEnvConfig } from '@next/env'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

loadEnvConfig(process.cwd())

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceKey) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 .env.local 에 없습니다')
  process.exit(1)
}

const supabase: SupabaseClient = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
})

/* ─────────────── 멤버 ─────────────── */

const ADMINS = ['이상호', '양민기', '이우재']
const OPERATIONS_EXEMPT = ['양민기', '이우재'] // 운영비(membership) 입금 면제
const ACTIVE_REGULAR = [
  '김동주', '서수민', '박경환', '이신우', '이애리', '임지향',
  '김윤정', '서유나', '김영호', '박성철', '최수진', '강성민',
  '유병우', '이종명'
]
const ACTIVE_NAMES = [...ADMINS, ...ACTIVE_REGULAR] // 17명

/* ─────────────── 출결 ─────────────── */

type SessionAtt = {
  quarterName: '2026-Q1' | '2026-Q2'
  n: number
  date: string
  present: string[]
  late: string[]
  absent: string[]
}

const SESSIONS: SessionAtt[] = [
  {
    quarterName: '2026-Q1', n: 1, date: '2026-01-14',
    present: ['임지향','김영호','이애리','박경환','양민기','이신우','박성철','김윤정','서유나','강성민','김동주','유병우'],
    late: [],
    absent: ['이상호','이우재','서수민','최수진','이종명']
  },
  {
    quarterName: '2026-Q1', n: 2, date: '2026-01-28',
    present: ['임지향','이애리','이우재','서수민','박성철','김영호','박경환','김윤정','양민기','서유나','유병우','이상호','김동주','이종명','최수진'],
    late: [],
    absent: ['이신우','강성민']
  },
  {
    quarterName: '2026-Q1', n: 3, date: '2026-02-11',
    present: ['이우재','임지향','김영호','박성철','이애리','서수민','강성민','김동주','양민기','서유나','김윤정','이신우'],
    late: ['이상호'],
    absent: ['박경환','최수진','유병우','이종명']
  },
  {
    quarterName: '2026-Q1', n: 4, date: '2026-02-25',
    present: ['임지향','김영호','박성철','이우재','박경환','서수민','서유나','김동주','유병우','이애리','이신우'],
    late: ['김윤정','이종명','최수진'],
    absent: ['이상호','양민기','강성민']
  },
  {
    quarterName: '2026-Q1', n: 5, date: '2026-03-11',
    present: ['이우재','이종명','유병우','김영호','김동주','이애리','이신우','강성민','최수진','박성철'],
    late: ['이상호','김윤정'],
    absent: ['임지향','박경환','서수민','양민기','서유나']
  },
  {
    quarterName: '2026-Q1', n: 6, date: '2026-03-25',
    present: ['임지향','박성철','이애리','서수민','박경환','이상호','김동주','서유나','양민기','김영호','이종명'],
    late: [],
    absent: ['이우재','김윤정','이신우','최수진','강성민','유병우']
  },
  {
    quarterName: '2026-Q2', n: 1, date: '2026-04-08',
    present: ['임지향','김영호','박성철','김동주','서수민','강성민','이종명','이신우','서유나'],
    late: ['이상호','김윤정','유병우'],
    absent: ['양민기','이우재','박경환','이애리','최수진']
  },
  {
    quarterName: '2026-Q2', n: 3, date: '2026-05-06',
    present: ['박성철','김영호','이우재','양민기','박경환','서수민','이상호','강성민','김동주','이신우','서유나','최수진'],
    late: [],
    absent: ['임지향','김윤정','이애리','유병우','이종명']
  }
]

const PENALTY = { absent: 10000, late: 3000 }
const MEMBERSHIP_FEE = 45000
const DEPOSIT_INITIAL = 45000

/* ─────────────── 메인 ─────────────── */

type MemberRow = { id: string; name: string; is_active: boolean; is_admin: boolean }

async function main() {
  console.log('▶ 26년 상반기 동기화 v2 시작')

  // 사전 검증: 회차별 분류 합계/중복
  for (const s of SESSIONS) {
    const all = [...s.present, ...s.late, ...s.absent]
    if (all.length !== 17) {
      throw new Error(`${s.quarterName} #${s.n} 분류 합계 ${all.length} != 17`)
    }
    if (new Set(all).size !== all.length) {
      throw new Error(`${s.quarterName} #${s.n} 분류 중복`)
    }
    for (const name of all) {
      if (!ACTIVE_NAMES.includes(name)) {
        throw new Error(`${s.quarterName} #${s.n} 알 수 없는 멤버: ${name}`)
      }
    }
  }

  // 0. 멤버/분기/회차 ID 조회
  const { data: members, error: mErr } = await supabase
    .from('members').select('id, name, is_active, is_admin')
  if (mErr) throw new Error(`members select: ${mErr.message}`)
  const memByName = new Map<string, MemberRow>()
  for (const m of (members ?? []) as MemberRow[]) memByName.set(m.name, m)

  for (const name of ACTIVE_NAMES) {
    if (!memByName.has(name)) throw new Error(`활성 멤버 누락: ${name}`)
  }

  // 문우곤 신규 비활성 INSERT (없으면)
  if (!memByName.has('문우곤')) {
    const { data, error } = await supabase.from('members')
      .insert({ name: '문우곤', is_active: false, is_admin: false, joined_at: '2026-01-14' })
      .select('id, name, is_active, is_admin').single()
    if (error || !data) throw new Error(`문우곤 INSERT: ${error?.message}`)
    memByName.set('문우곤', data as MemberRow)
    console.log('  + 문우곤 비활성 INSERT')
  }

  const { data: quarters, error: qErr } = await supabase.from('quarters').select('id, name')
  if (qErr) throw new Error(`quarters select: ${qErr.message}`)
  const qByName = new Map<string, string>()
  for (const q of quarters ?? []) qByName.set(q.name, q.id)
  const q1Id = qByName.get('2026-Q1')
  const q2Id = qByName.get('2026-Q2')
  if (!q1Id || !q2Id) throw new Error('2026-Q1 또는 2026-Q2 분기 누락. seed:data 먼저 실행 필요')

  const { data: sessionRows, error: sErr } = await supabase
    .from('sessions')
    .select('id, quarter_id, session_number, date, type')
    .in('quarter_id', [q1Id, q2Id])
  if (sErr) throw new Error(`sessions select: ${sErr.message}`)
  type SessRow = { id: string; quarter_id: string; session_number: number; type: string }
  const sessionByKey = new Map<string, SessRow>()
  for (const s of (sessionRows ?? []) as SessRow[]) {
    const qName = s.quarter_id === q1Id ? '2026-Q1' : '2026-Q2'
    sessionByKey.set(`${qName}#${s.session_number}`, s)
  }
  for (const sd of SESSIONS) {
    const found = sessionByKey.get(`${sd.quarterName}#${sd.n}`)
    if (!found) throw new Error(`세션 누락: ${sd.quarterName} #${sd.n}`)
    if (found.type !== 'normal') {
      throw new Error(`세션 type 불일치 (normal 기대): ${sd.quarterName} #${sd.n} = ${found.type}`)
    }
  }

  /* 1. v1 데이터 정리 (2026-Q1, 2026-Q2 한정) */
  console.log('\n▶ 1. 기존 v1 데이터 정리')

  const sessionIds = SESSIONS.map(sd => sessionByKey.get(`${sd.quarterName}#${sd.n}`)!.id)

  const { error: attDelErr, count: attDelCnt } = await supabase
    .from('attendances').delete({ count: 'exact' }).in('session_id', sessionIds)
  if (attDelErr) throw new Error(`attendances delete: ${attDelErr.message}`)
  console.log(`  - attendances ${attDelCnt ?? 0}건 삭제`)

  const { data: oldDeposits } = await supabase.from('deposits').select('id').in('quarter_id', [q1Id, q2Id])
  const oldDepositIds = (oldDeposits ?? []).map((d: { id: string }) => d.id)
  if (oldDepositIds.length > 0) {
    const { error: dtxErr, count: dtxCnt } = await supabase
      .from('deposit_transactions').delete({ count: 'exact' }).in('deposit_id', oldDepositIds)
    if (dtxErr) throw new Error(`deposit_tx delete: ${dtxErr.message}`)
    console.log(`  - deposit_transactions ${dtxCnt ?? 0}건 삭제`)
  } else {
    console.log('  - deposit_transactions: 기존 deposits 없음')
  }

  const { error: dDelErr, count: dDelCnt } = await supabase
    .from('deposits').delete({ count: 'exact' }).in('quarter_id', [q1Id, q2Id])
  if (dDelErr) throw new Error(`deposits delete: ${dDelErr.message}`)
  console.log(`  - deposits ${dDelCnt ?? 0}건 삭제`)

  const { error: ftDelErr, count: ftDelCnt } = await supabase
    .from('fund_transactions').delete({ count: 'exact' }).in('quarter_id', [q1Id, q2Id])
  if (ftDelErr) throw new Error(`fund_transactions delete: ${ftDelErr.message}`)
  console.log(`  - fund_transactions ${ftDelCnt ?? 0}건 삭제`)

  /* 2. 권한/활성 갱신 */
  console.log('\n▶ 2. 권한 / 활성 갱신')
  for (const name of ACTIVE_NAMES) {
    const m = memByName.get(name)!
    const wantAdmin = ADMINS.includes(name)
    if (!m.is_active || m.is_admin !== wantAdmin) {
      const { error } = await supabase.from('members')
        .update({ is_active: true, is_admin: wantAdmin }).eq('id', m.id)
      if (error) throw new Error(`member update ${name}: ${error.message}`)
      console.log(`  ~ ${name}: active=true, admin=${wantAdmin}`)
    }
  }
  const yumin = memByName.get('김유민')
  if (yumin && yumin.is_active) {
    const { error } = await supabase.from('members').update({ is_active: false }).eq('id', yumin.id)
    if (error) throw new Error(`김유민 update: ${error.message}`)
    console.log('  ~ 김유민: is_active=false (2026-Q1 종료 후 탈퇴)')
  }
  const woogon = memByName.get('문우곤')
  if (woogon && woogon.is_active) {
    const { error } = await supabase.from('members').update({ is_active: false }).eq('id', woogon.id)
    if (error) throw new Error(`문우곤 update: ${error.message}`)
    console.log('  ~ 문우곤: is_active=false')
  }

  /* 3. attendances INSERT */
  console.log('\n▶ 3. attendances INSERT')
  const attRows: any[] = []
  for (const sd of SESSIONS) {
    const sess = sessionByKey.get(`${sd.quarterName}#${sd.n}`)!
    for (const name of ACTIVE_NAMES) {
      const m = memByName.get(name)!
      let status: 'present' | 'late' | 'absent'
      if (sd.present.includes(name)) status = 'present'
      else if (sd.late.includes(name)) status = 'late'
      else status = 'absent'
      attRows.push({
        session_id: sess.id,
        member_id: m.id,
        status,
        is_confirmed: true,
        checked_in_at: status === 'absent' ? null : `${sd.date}T19:00:00+09:00`
      })
    }
  }
  const { error: attInsErr } = await supabase.from('attendances').insert(attRows)
  if (attInsErr) throw new Error(`attendances insert: ${attInsErr.message}`)
  console.log(`  + attendances ${attRows.length}건 INSERT`)

  // attendance id 재조회 (페널티 reference_id용)
  const { data: insertedAtts } = await supabase
    .from('attendances')
    .select('id, session_id, member_id')
    .in('session_id', sessionIds)
  const attByKey = new Map<string, string>()
  for (const a of (insertedAtts ?? []) as { id: string; session_id: string; member_id: string }[]) {
    attByKey.set(`${a.session_id}#${a.member_id}`, a.id)
  }

  /* 4. deposits INSERT (2026-Q1 한 row, 17명) */
  console.log('\n▶ 4. deposits INSERT (2026-Q1)')
  const depositRows = ACTIVE_NAMES.map(name => ({
    member_id: memByName.get(name)!.id,
    quarter_id: q1Id,
    initial_amount: DEPOSIT_INITIAL,
    current_balance: DEPOSIT_INITIAL // 페널티 차감은 5단계 이후 update
  }))
  const { data: insertedDeposits, error: depInsErr } = await supabase
    .from('deposits').insert(depositRows).select('id, member_id')
  if (depInsErr) throw new Error(`deposits insert: ${depInsErr.message}`)
  const depByMember = new Map<string, string>()
  for (const d of (insertedDeposits ?? []) as { id: string; member_id: string }[]) {
    depByMember.set(d.member_id, d.id)
  }
  console.log(`  + deposits ${insertedDeposits?.length ?? 0}건 INSERT (전원 ${DEPOSIT_INITIAL}원)`)

  /* 5. deposit_transactions INSERT */
  console.log('\n▶ 5. deposit_transactions INSERT')
  const dtxRows: any[] = []
  // 5a. 시작 입금 (Q1 시작일)
  for (const name of ACTIVE_NAMES) {
    const m = memByName.get(name)!
    dtxRows.push({
      deposit_id: depByMember.get(m.id),
      amount: DEPOSIT_INITIAL,
      reason: '26년 상반기 보증금 입금',
      reference_type: 'deposit',
      created_at: '2026-01-14T19:00:00+09:00'
    })
  }
  // 5b. 페널티 거래 (회차별)
  for (const sd of SESSIONS) {
    const sess = sessionByKey.get(`${sd.quarterName}#${sd.n}`)!
    for (const name of sd.absent) {
      const m = memByName.get(name)!
      const attId = attByKey.get(`${sess.id}#${m.id}`)
      if (!attId) throw new Error(`attendance id 누락: ${name} ${sd.date}`)
      dtxRows.push({
        deposit_id: depByMember.get(m.id),
        amount: -PENALTY.absent,
        reason: `결석 (${sd.date})`,
        reference_type: 'attendance',
        reference_id: attId,
        created_at: `${sd.date}T19:00:00+09:00`
      })
    }
    for (const name of sd.late) {
      const m = memByName.get(name)!
      const attId = attByKey.get(`${sess.id}#${m.id}`)
      if (!attId) throw new Error(`attendance id 누락: ${name} ${sd.date}`)
      dtxRows.push({
        deposit_id: depByMember.get(m.id),
        amount: -PENALTY.late,
        reason: `지각 (${sd.date})`,
        reference_type: 'attendance',
        reference_id: attId,
        created_at: `${sd.date}T19:00:00+09:00`
      })
    }
  }
  const { error: dtxInsErr } = await supabase.from('deposit_transactions').insert(dtxRows)
  if (dtxInsErr) throw new Error(`deposit_tx insert: ${dtxInsErr.message}`)
  console.log(`  + deposit_transactions ${dtxRows.length}건 INSERT`)

  /* 5c. deposits.current_balance 갱신 */
  console.log('\n▶ 6. deposits.current_balance 갱신')
  for (const name of ACTIVE_NAMES) {
    const m = memByName.get(name)!
    const depId = depByMember.get(m.id)!
    let balance = DEPOSIT_INITIAL
    for (const sd of SESSIONS) {
      if (sd.absent.includes(name)) balance -= PENALTY.absent
      if (sd.late.includes(name)) balance -= PENALTY.late
    }
    const { error } = await supabase.from('deposits')
      .update({ current_balance: balance }).eq('id', depId)
    if (error) throw new Error(`deposit balance update ${name}: ${error.message}`)
  }
  console.log(`  ~ 17명 잔액 갱신`)

  /* 7. fund_transactions INSERT */
  console.log('\n▶ 7. fund_transactions INSERT')
  const ftRows: any[] = []
  // 7a. 운영비 입금 (양민기/이우재 면제)
  for (const name of ACTIVE_NAMES) {
    if (OPERATIONS_EXEMPT.includes(name)) continue
    ftRows.push({
      quarter_id: q1Id,
      amount: MEMBERSHIP_FEE,
      category: 'membership',
      description: `${name} 26년 상반기 운영비`,
      date: '2026-01-14'
    })
  }
  // 7b. 페널티 → 운영비 자동 전환 (각 페널티 동일 금액)
  for (const sd of SESSIONS) {
    const sess = sessionByKey.get(`${sd.quarterName}#${sd.n}`)!
    for (const name of sd.absent) {
      ftRows.push({
        quarter_id: sess.quarter_id,
        amount: PENALTY.absent,
        category: 'penalty',
        description: `${name} 결석 페널티 (${sd.date})`,
        date: sd.date
      })
    }
    for (const name of sd.late) {
      ftRows.push({
        quarter_id: sess.quarter_id,
        amount: PENALTY.late,
        category: 'penalty',
        description: `${name} 지각 페널티 (${sd.date})`,
        date: sd.date
      })
    }
  }
  const { error: ftInsErr } = await supabase.from('fund_transactions').insert(ftRows)
  if (ftInsErr) throw new Error(`fund_tx insert: ${ftInsErr.message}`)
  console.log(`  + fund_transactions ${ftRows.length}건 INSERT`)

  /* 8. 검증 */
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('검증 결과')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  // 8-1. 활성 멤버
  const { data: activeRows } = await supabase
    .from('members').select('name, is_admin')
    .eq('is_active', true).order('is_admin', { ascending: false }).order('name')
  console.log(`\n[활성 멤버 ${activeRows?.length ?? 0}명]`)
  for (const m of (activeRows ?? []) as { name: string; is_admin: boolean }[]) {
    console.log(`  ${m.is_admin ? '👑' : '  '} ${m.name}`)
  }

  // 8-2. 회차별 출결 통계
  console.log('\n[회차별 출결 통계]')
  for (const sd of SESSIONS) {
    const sess = sessionByKey.get(`${sd.quarterName}#${sd.n}`)!
    const { data: stat } = await supabase
      .from('attendances').select('status').eq('session_id', sess.id)
    const present = stat?.filter(a => a.status === 'present').length ?? 0
    const late = stat?.filter(a => a.status === 'late').length ?? 0
    const absent = stat?.filter(a => a.status === 'absent').length ?? 0
    console.log(`  ${sd.date} ${sd.quarterName} #${sd.n}: 출석 ${present} / 지각 ${late} / 결석 ${absent}`)
  }

  // 8-3. 멤버별 보증금 잔액
  console.log('\n[멤버별 보증금 잔액 (2026-Q1)]')
  const { data: depResult } = await supabase
    .from('deposits')
    .select('current_balance, initial_amount, member:members(name)')
    .eq('quarter_id', q1Id)
    .order('current_balance', { ascending: false })
  for (const d of (depResult ?? []) as any[]) {
    const penalty = d.initial_amount - d.current_balance
    console.log(`  ${d.member.name.padEnd(6, ' ')}  잔액 ${String(d.current_balance).padStart(6, ' ')}원  (페널티 -${penalty})`)
  }

  // 8-4. 운영비 합계
  console.log('\n[운영비 카테고리별 합계 (2026-Q1+Q2)]')
  const { data: ftStat } = await supabase
    .from('fund_transactions').select('category, amount').in('quarter_id', [q1Id, q2Id])
  const sumByCat = new Map<string, number>()
  for (const t of (ftStat ?? []) as { category: string; amount: number }[]) {
    sumByCat.set(t.category, (sumByCat.get(t.category) ?? 0) + t.amount)
  }
  let total = 0
  for (const [cat, sum] of sumByCat.entries()) {
    console.log(`  ${cat.padEnd(12, ' ')} ${sum.toLocaleString()}원`)
    total += sum
  }
  console.log(`  ${'TOTAL'.padEnd(12, ' ')} ${total.toLocaleString()}원`)

  console.log('\n✓ 동기화 완료')
}

main().catch(e => {
  console.error('\n❌ 실패:', e instanceof Error ? e.message : e)
  process.exit(1)
})
