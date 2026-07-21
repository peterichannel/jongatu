import { SkeletonBar, SkeletonCard } from '@/components/Skeleton'

// admin/(authed)/layout.tsx 가 운영자 인증을 await 하는 동안 보이는 화면.
// 레이아웃 자체가 아직 안 그려졌으므로 헤더 뼈대까지 함께 그린다.
export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-5">
        <SkeletonBar className="h-6 w-28" />
        <SkeletonBar className="h-4 w-20" />
      </header>
      <div className="mx-auto max-w-[800px] px-5 py-6">
        <SkeletonBar className="mb-2 h-8 w-40" />
        <SkeletonBar className="mb-6 h-4 w-56" />
        <SkeletonCard className="mb-6 h-32" />
        <div className="grid grid-cols-2 gap-4">
          {[0, 1, 2, 3].map(i => (
            <SkeletonCard key={i} className="h-32" />
          ))}
        </div>
      </div>
    </div>
  )
}
