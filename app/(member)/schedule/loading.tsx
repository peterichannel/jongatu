import { SkeletonBar, SkeletonCard } from '@/components/Skeleton'

export default function Loading() {
  return (
    <main className="flex-1 px-5 py-6">
      <SkeletonBar className="mb-1 h-8 w-20" />
      <SkeletonBar className="mb-5 h-4 w-24" />

      <SkeletonCard className="mb-4 h-12" /> {/* 분기 선택 */}
      <div className="space-y-3">
        {[0, 1, 2, 3, 4].map(i => (
          <SkeletonCard key={i} className="h-20" />
        ))}
      </div>
    </main>
  )
}
