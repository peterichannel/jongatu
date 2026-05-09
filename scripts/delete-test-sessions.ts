/**
 * 테스트 회차 + 관련 데이터 일괄 정리
 *  - is_test = true 회차 모두 삭제
 *  - sessions ON DELETE CASCADE 설정으로 attendances/pre_attendances/presentations 자동 삭제
 *  - deposit_transactions / fund_transactions 도 reference_id 가 회차 ID 인 행 함께 정리
 *    (테스트 회차는 페널티 트랜잭션을 만들지 않지만, 만일을 대비해 보수적으로 정리)
 *
 * 실행:
 *   npx tsx scripts/delete-test-sessions.ts
 */
import { loadEnvConfig } from '@next/env'
import { createClient } from '@supabase/supabase-js'

loadEnvConfig(process.cwd())

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('env missing (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)')
  process.exit(1)
}

const sb = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false }
})

async function main() {
  const { data: testSessions, error: selErr } = await sb
    .from('sessions')
    .select('id, date, session_number, quarter_id')
    .eq('is_test', true)
  if (selErr) {
    console.error('select error:', selErr.message)
    process.exit(1)
  }
  if (!testSessions || testSessions.length === 0) {
    console.log('[skip] 테스트 회차가 없습니다.')
    return
  }
  const ids = testSessions.map(s => s.id)
  console.log(`[1] 삭제 대상 테스트 회차 ${ids.length}건:`)
  for (const s of testSessions) {
    console.log(`    - ${s.id} (${s.date} #${s.session_number})`)
  }

  // 안전 가드: 혹시라도 테스트 회차로 잘못 생긴 페널티 트랜잭션 정리
  const { error: dtErr, count: dtCount } = await sb
    .from('deposit_transactions')
    .delete({ count: 'exact' })
    .eq('reference_type', 'attendance')
    .in('reference_id', ids)
  if (dtErr) console.warn('deposit_transactions 정리 경고:', dtErr.message)
  else console.log(`[2] deposit_transactions ${dtCount ?? 0}건 삭제`)

  // fund_transactions 는 reference 가 없으니 description 기반 매칭
  // (테스트 회차는 페널티 안 만드는 게 정상이므로 fund_transactions 는 안 건드림)

  const { error: delErr, count } = await sb
    .from('sessions')
    .delete({ count: 'exact' })
    .eq('is_test', true)
  if (delErr) {
    console.error('sessions delete error:', delErr.message)
    process.exit(1)
  }
  console.log(`[done] sessions ${count ?? 0}건 삭제 (CASCADE 로 attendances/pre_attendances/presentations 동반 삭제)`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
