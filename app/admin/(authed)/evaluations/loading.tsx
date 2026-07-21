import { SkeletonBar, SkeletonCard } from '@/components/Skeleton'

export default function Loading() {
  return (
    <div>
      <SkeletonBar className="mb-4 h-4 w-24" />
      <SkeletonBar className="mb-2 h-8 w-32" />
      <SkeletonBar className="mb-6 h-4 w-28" />
      <SkeletonCard className="mb-4 h-14" /> {/* 회차 선택 */}
      <div className="space-y-3">
        {[0, 1, 2].map(i => (
          <SkeletonCard key={i} className="h-40" />
        ))}
      </div>
    </div>
  )
}
