/**
 * 테스트 회차 생성 (운영진 전용 노출)
 *  - 활성 분기에 오늘(Asia/Seoul) 날짜로 1건 INSERT
 *  - session_number = 9999 (실제 회차와 충돌 방지)
 *  - is_test = true, type = 'normal'
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

function todayISOInSeoul() {
  const now = new Date()
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000
  const seoul = new Date(utcMs + 9 * 3600_000)
  const yyyy = seoul.getFullYear()
  const mm = String(seoul.getMonth() + 1).padStart(2, '0')
  const dd = String(seoul.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

async function main() {
  const today = todayISOInSeoul()

  const { data: q, error: qErr } = await sb
    .from('quarters')
    .select('id, name, year, quarter')
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
  console.log(`[1] 활성 분기: ${q.name} (${q.year}-Q${q.quarter})`)
  console.log(`[2] 오늘(Asia/Seoul): ${today}`)

  const { data: existing } = await sb
    .from('sessions')
    .select('id, date, session_number, is_test')
    .eq('quarter_id', q.id)
    .eq('session_number', TEST_SESSION_NUMBER)
    .maybeSingle()

  if (existing) {
    if (existing.date === today && existing.is_test) {
      console.log(`[skip] 이미 오늘(${today}) 테스트 회차가 있습니다. id=${existing.id}`)
      return
    }
    console.log(
      `[update] 기존 #${TEST_SESSION_NUMBER} 회차를 오늘 날짜로 갱신합니다 (id=${existing.id})`
    )
    const { error: upErr } = await sb
      .from('sessions')
      .update({ date: today, is_test: true, type: 'normal', note: '테스트 회차' })
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
      note: '테스트 회차'
    })
    .select()
    .single()
  if (insErr) {
    console.error('insert error:', insErr.message)
    process.exit(1)
  }
  console.log(`[done] 테스트 회차 생성 완료. id=${inserted.id}`)
  console.log(`  - 멤버 홈(/) 에서 운영진만 "오늘 스터디" 카드 + 자가 체크인 버튼 노출`)
  console.log(`  - 운영자 출석체크: /admin/schedule/${inserted.id}/attendance`)
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
