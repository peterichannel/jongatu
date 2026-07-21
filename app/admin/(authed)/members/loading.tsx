import { SkeletonBar, SkeletonCard } from '@/components/Skeleton'

export default function Loading() {
  return (
    <div>
      <SkeletonBar className="mb-4 h-4 w-24" />
      <SkeletonBar className="mb-6 h-8 w-44" />
      <div className="space-y-2">
        {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
          <SkeletonCard key={i} className="h-14" />
        ))}
      </div>
    </div>
  )
}
