// 로딩 스켈레톤 공용 조각.
// 60대 사용자 기준으로 "뭔가 오고 있다"가 한눈에 보이도록 큰 덩어리 위주로 구성한다.

export function SkeletonBar({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-gray-200 ${className}`} />
}

export function SkeletonCard({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-gray-100 ${className}`} />
}

/** 페이지 제목 자리 */
export function SkeletonTitle() {
  return <SkeletonBar className="mb-6 h-7 w-32" />
}
