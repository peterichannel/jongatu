import { BottomNav } from '@/components/BottomNav'
import { BrandHeader } from '@/components/BrandHeader'

export default function MemberLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-[430px] flex-col bg-white pb-[88px] shadow-sm">
      <BrandHeader />
      {children}
      <BottomNav />
    </div>
  )
}
