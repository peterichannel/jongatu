// 앱 공통 상단 브랜딩 헤더 — 멤버/관리자 레이아웃 최상단에 배치 (로그인 화면 포함)
// 메인 타이틀 + 슬로건, 가운데 정렬. 인쇄 시엔 숨김(리포트 자체 헤더 사용).
export function BrandHeader() {
  return (
    <div className="border-b border-gray-100 bg-white px-4 py-3 text-center print:hidden">
      <h1 className="text-xl font-bold tracking-tight text-gray-900">
        종로 가치 투자 스터디
      </h1>
      <p className="mt-0.5 text-sm font-medium text-green-600">우리는 부자다!</p>
    </div>
  )
}
