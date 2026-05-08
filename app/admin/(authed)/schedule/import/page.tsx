import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { supabaseAdmin } from '@/lib/supabase/server'
import type { Member, Quarter } from '@/lib/types'
import { ImportForm } from './import-form'

export const revalidate = 0

export default async function ImportPage() {
  let envError: string | null = null
  let activeQuarter: Quarter | null = null
  let members: Member[] = []

  try {
    const supabase = supabaseAdmin()
    const [qRes, mRes] = await Promise.all([
      supabase.from('quarters').select('*').eq('is_active', true).maybeSingle(),
      supabase.from('members').select('*').eq('is_active', true).order('name')
    ])
    if (qRes.error) throw new Error(qRes.error.message)
    if (mRes.error) throw new Error(mRes.error.message)
    activeQuarter = qRes.data
    members = mRes.data ?? []
  } catch (e) {
    envError = e instanceof Error ? e.message : 'Supabase 연결 실패'
  }

  return (
    <div>
      <Link
        href="/admin/schedule"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
      >
        <ChevronLeft className="h-4 w-4" /> 분기 일정
      </Link>
      <h1 className="mb-6 text-2xl font-bold">엑셀로 일정 등록</h1>

      {envError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {envError}
        </div>
      ) : !activeQuarter ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          활성 분기가 없습니다. 먼저 분기 일정 페이지에서 분기를 등록하세요.
        </div>
      ) : (
        <ImportForm quarter={activeQuarter} members={members} />
      )}
    </div>
  )
}
