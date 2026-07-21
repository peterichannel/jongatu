import { SkeletonCard, SkeletonTitle } from '@/components/Skeleton'

export default function Loading() {
  return (
    <main className="flex-1 px-5 py-6">
      <SkeletonTitle />
      <SkeletonCard className="mb-4 h-44" /> {/* 오늘 회차 */}
      <SkeletonCard className="h-44" /> {/* 다음 회차 사전참석 */}
    </main>
  )
}
