/**
 * 테스트 회차 생성 (운영진 전용 노출)
 *  - 활성 분기에 오늘(Asia/Seoul) 날짜로 1건 INSERT
 *  - session_number = 9999 (실제 회차와 충돌 방지)
 *  - is_test = true, type = 'normal'
 *  - late_after_minutes = 990 (16:30) — 16:30 이전 자가 체크인은 출석, 이후는 지각으로 판정
 *  - 발표 슬롯은 비워둠
 *
 * 실행:
 *   npx tsx scripts/create-test-session.ts
 *
 * 정리:
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

const TEST_SESSION_NUMBER = 9999
const TEST_LATE_AFTER_MINUTES = 16 * 60 + 30 // 16:30 = 990
const TEST_NOTE = '테스트 회차 (16:30 이후 = 지각)'

function todayISOInSeoul() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date())
}

async function main() {
  const today = todayISOInSeoul()

  const { data: q, error: qErr } = await sb
    .from('quarters')
    .select('id, name')
    .eq('is_active', true)
    .maybeSingle()
  if (qErr) {
    console.error('quarters fetch error:', qErr.message)
    process.exit(1)
  }
  if (!q) {
    console.error('활성 분기가 없습니다. 운영자 화면에서 분기를 활성화 후 재시도하세요.')
    process.exit(1)
  }
  console.log(`[1] 활성 분기: ${q.name}`)
  console.log(`[2] 오늘(Asia/Seoul): ${today}`)

  const { data: existing } = await sb
    .from('sessions')
    .select('id, date, session_number, is_test')
    .eq('quarter_id', q.id)
    .eq('session_number', TEST_SESSION_NUMBER)
    .maybeSingle()

  if (existing) {
    console.log(
      `[update] 기존 #${TEST_SESSION_NUMBER} 회차를 오늘 날짜 + 16:30 기준으로 갱신합니다 (id=${existing.id})`
    )
    const { error: upErr } = await sb
      .from('sessions')
      .update({
        date: today,
        is_test: true,
        type: 'normal',
        note: TEST_NOTE,
        late_after_minutes: TEST_LATE_AFTER_MINUTES
      })
      .eq('id', existing.id)
    if (upErr) {
      console.error('update error:', upErr.message)
      process.exit(1)
    }
    console.log(`[done] 갱신 완료. /admin/schedule/${existing.id}/attendance 에서 확인 가능`)
    return
  }

  const { data: inserted, error: insErr } = await sb
    .from('sessions')
    .insert({
      quarter_id: q.id,
      session_number: TEST_SESSION_NUMBER,
      date: today,
      type: 'normal',
      is_test: true,
      note: TEST_NOTE,
      late_after_minutes: TEST_LATE_AFTER_MINUTES
    })
    .select()
    .single()
  if (insErr) {
    console.error('insert error:', insErr.message)
    process.exit(1)
  }
  console.log(`[done] 테스트 회차 생성 완료. id=${inserted.id}`)
  console.log(`  - 지각 기준: 16:30 (이전 누르면 출석, 이후 누르면 지각)`)
  console.log(`  - 멤버 홈(/) 에서 운영진만 "오늘 스터디" 카드 + 자가 체크인 버튼 노출`)
  console.log(`  - 운영자 출석체크: /admin/schedule/${inserted.id}/attendance`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
