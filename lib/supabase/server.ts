import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cached: SupabaseClient | null = null

export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'Supabase 환경변수가 설정되지 않았습니다. .env.local 에 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 를 입력하세요.'
    )
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
  return cached
}
