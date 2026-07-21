import { SkeletonBar, SkeletonCard } from '@/components/Skeleton'

// 홈(/) 전용 — 하위 라우트는 각자 loading.tsx 를 가진다.
export default function Loading() {
  return (
    <main className="flex-1 px-5 py-6">
      <SkeletonCard className="mb-6 h-40" /> {/* 인사말 + 다음 스터디 */}
      <SkeletonCard className="mb-5 h-16" /> {/* 지금 해야 할 일 */}
      <SkeletonCard className="h-48" /> {/* 내 정보 미리보기 */}
    </main>
  )
}
