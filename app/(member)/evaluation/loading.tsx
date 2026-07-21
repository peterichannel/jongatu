import { SkeletonCard, SkeletonTitle } from '@/components/Skeleton'

export default function Loading() {
  return (
    <main className="flex-1 px-5 py-6">
      <SkeletonTitle />
      <SkeletonCard className="mb-4 h-16" /> {/* 회차 안내 */}
      <div className="space-y-3">
        {[0, 1].map(i => (
          <SkeletonCard key={i} className="h-56" /> /* 발표자별 평가 폼 */
        ))}
      </div>
    </main>
  )
}
