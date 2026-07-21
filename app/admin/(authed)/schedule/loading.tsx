import { SkeletonBar, SkeletonCard } from '@/components/Skeleton'

export default function Loading() {
  return (
    <div>
      <SkeletonBar className="mb-4 h-4 w-24" />
      <SkeletonBar className="mb-6 h-8 w-32" />
      <SkeletonCard className="mb-4 h-16" /> {/* 분기 선택/편집 */}
      <div className="space-y-3">
        {[0, 1, 2, 3, 4, 5].map(i => (
          <SkeletonCard key={i} className="h-24" />
        ))}
      </div>
    </div>
  )
}
