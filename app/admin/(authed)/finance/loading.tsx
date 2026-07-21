import { SkeletonBar, SkeletonCard } from '@/components/Skeleton'

export default function Loading() {
  return (
    <div>
      <SkeletonBar className="mb-4 h-4 w-24" />
      <SkeletonBar className="mb-2 h-8 w-24" />
      <SkeletonBar className="mb-6 h-4 w-32" />

      {/* 반기 요약 4칸 */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map(i => (
          <SkeletonCard key={i} className="h-20" />
        ))}
      </div>
      <SkeletonCard className="h-80" />
    </div>
  )
}
