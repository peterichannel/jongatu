import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Home } from 'lucide-react'
import { getAuthedAdmin } from '@/lib/member-auth'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAuthedAdmin()
  if (!admin) redirect('/')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-5 print:hidden">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            aria-label="멤버 홈으로"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
          >
            <Home className="h-5 w-5" />
          </Link>
          <Link href="/admin" className="text-lg font-bold text-gray-900">
            관리자
          </Link>
        </div>
        <div className="text-sm text-gray-600">
          <span className="font-semibold">{admin.name}</span>
          <span className="ml-1 text-xs text-gray-400">운영자</span>
        </div>
      </header>
      <div className="mx-auto max-w-[800px] px-5 py-6">{children}</div>
    </div>
  )
}
