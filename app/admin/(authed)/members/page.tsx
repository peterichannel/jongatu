import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { supabaseAdmin } from '@/lib/supabase/server'
import { MembersTable, type MemberRow } from './members-table'

export const revalidate = 0

export default async function MembersPage() {
  let members: MemberRow[] = []
  let envError: string | null = null

  try {
    const supabase = supabaseAdmin()
    const { data, error } = await supabase
      .from('members')
      .select('id, name, joined_at, is_active, created_at, pin_hash, is_admin, recovery_answer')
      .order('is_active', { ascending: false })
      .order('joined_at', { ascending: true })
    if (error) envError = error.message
    members = (data ?? []).map(m => ({
      id: m.id,
      name: m.name,
      joined_at: m.joined_at,
      is_active: m.is_active,
      created_at: m.created_at,
      has_pin: !!m.pin_hash,
      is_admin: !!m.is_admin,
      has_recovery: !!m.recovery_answer
    }))
  } catch (e) {
    envError = e instanceof Error ? e.message : 'Supabase 연결 실패'
  }

  return (
    <div>
      <Link href="/admin" className="mb-4 inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900">
        <ChevronLeft className="h-4 w-4" /> 관리자 홈
      </Link>
      <h1 className="mb-6 text-2xl font-bold">스터디원 명단</h1>
      {envError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {envError}
        </div>
      ) : (
        <MembersTable members={members} />
      )}
    </div>
  )
}
