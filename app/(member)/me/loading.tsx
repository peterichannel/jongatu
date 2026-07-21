import { SkeletonBar, SkeletonCard } from '@/components/Skeleton'

export default function Loading() {
  return (
    <main className="flex-1 px-5 py-6">
      {/* 이름 + 반기 */}
      <SkeletonBar className="mb-1 h-8 w-40" />
      <SkeletonBar className="mb-6 h-4 w-24" />

      <SkeletonCard className="mb-5 h-24" /> {/* 프로필 */}
      <SkeletonCard className="mb-5 h-12" /> {/* 반기 선택 */}
      <SkeletonCard className="mb-5 h-36" /> {/* 보증금 */}
      <SkeletonCard className="mb-5 h-44" /> {/* 출석 통계 */}
      <SkeletonCard className="mb-5 h-32" /> {/* 발표 이력 */}
      <SkeletonCard className="h-32" /> {/* 받은 평가 */}
    </main>
  )
}
