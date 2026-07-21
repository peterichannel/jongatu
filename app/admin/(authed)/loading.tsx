import { SkeletonBar, SkeletonCard } from '@/components/Skeleton'

// 관리자 하위 페이지 이동 시 기본 스켈레톤 (헤더는 레이아웃이 이미 그린 상태).
export default function Loading() {
  return (
    <div>
      <SkeletonBar className="mb-4 h-4 w-24" /> {/* 관리자 홈 링크 */}
      <SkeletonBar className="mb-6 h-8 w-40" /> {/* 제목 */}
      <SkeletonCard className="mb-4 h-32" />
      <SkeletonCard className="h-64" />
    </div>
  )
}
