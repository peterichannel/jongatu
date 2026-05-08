/**
 * 일회용 DB 검증 스크립트 (커밋 전 sanity check)
 *   1) members 테이블 컬럼 구조 (권한 컬럼명 확인)
 *   2) 2026-Q1 멤버별 보증금 잔액
 */
import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'

loadEnvConfig(process.cwd())

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('env missing'); process.exit(1) }

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

async function main() {
  // (1) 컬럼 구조 — members 한 행을 받아 keys 출력 (information_schema 대체)
  const { data: oneMember, error: e1 } = await sb.from('members').select('*').limit(1).maybeSingle()
  if (e1) { console.error('members fetch error:', e1.message); process.exit(1) }
  console.log('\n[1] members 컬럼 (실제 row 키 기준)')
  if (oneMember) {
    for (const k of Object.keys(oneMember)) {
      const v = (oneMember as Record<string, unknown>)[k]
      const t = v === null ? 'null' : typeof v
      console.log(`   ${k.padEnd(20, ' ')} ${t}`)
    }
  } else {
    console.log('   (멤버 0건)')
  }

  // (2) 2026-Q1 보증금 잔액
  const { data: q, error: e2 } = await sb.from('quarters').select('id, name').eq('name', '2026-Q1').maybeSingle()
  if (e2 || !q) { console.error('2026-Q1 분기 없음:', e2?.message); process.exit(1) }

  const { data: rows, error: e3 } = await sb
    .from('deposits')
    .select('initial_amount, current_balance, member:members!inner(name, is_active)')
    .eq('quarter_id', q.id)
  if (e3) { console.error('deposits fetch error:', e3.message); process.exit(1) }

  type Row = { initial_amount: number; current_balance: number; member: { name: string; is_active: boolean } }
  const list = ((rows ?? []) as unknown as Row[])
    .filter(r => r.member?.is_active)
    .sort((a, b) => a.current_balance - b.current_balance)

  console.log('\n[2] 2026-Q1 활성 멤버 보증금 (current_balance ASC)')
  console.log('   name           initial   balance   penalty')
  for (const r of list) {
    const penalty = r.initial_amount - r.current_balance
    console.log(`   ${r.member.name.padEnd(12, ' ')} ${String(r.initial_amount).padStart(7, ' ')}  ${String(r.current_balance).padStart(7, ' ')}  ${String(penalty).padStart(7, ' ')}`)
  }

  // 확인 포인트: 양민기/이우재
  const focus = list.filter(r => ['양민기', '이우재'].includes(r.member.name))
  console.log('\n[focus] 양민기/이우재')
  for (const r of focus) {
    const verdict = r.current_balance === 15000 ? '✓ v2 정상' : r.current_balance === 45000 ? '⚠ v1 잔재 의심' : `? balance=${r.current_balance}`
    console.log(`   ${r.member.name}: balance=${r.current_balance} → ${verdict}`)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
