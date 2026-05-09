export default function Loading() {
  return (
    <main className="flex-1 px-5 py-6">
      {/* 페이지 제목 자리 */}
      <div className="mb-6 h-7 w-32 animate-pulse rounded-md bg-gray-200" />

      <div className="space-y-4">
        <div className="h-28 animate-pulse rounded-2xl bg-gray-100" />
        <div className="h-20 animate-pulse rounded-2xl bg-gray-100" />
        <div className="h-32 animate-pulse rounded-2xl bg-gray-100" />
      </div>
    </main>
  )
}
