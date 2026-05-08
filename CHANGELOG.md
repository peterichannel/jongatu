# CHANGELOG

## 2026-05-09 (오후)

### 마이그레이션 0010 - quarters.operating_fee
- `quarters.operating_fee INTEGER NOT NULL DEFAULT 30000` 추가
  - 분기 1인당 각출 운영비 (보증금과 별도)
  - 22년 하반기 결산 양식 기준: 운영비 30,000 + 보증금 30,000 = 60,000/인
- Quarter 타입 + 분기 폼 (`/admin/schedule` QuarterForm) 운영비 입력 칸 추가
- Quarter PATCH/POST API 가 `operating_fee` 수용

### 멤버 홈 (`/`) 개선
- **사전참석 응답이 홈에 카드로 노출** — 응답하면 "참석 ✓ / 불참 ✗ (사유)" 형태로 보이고 [응답 변경] 링크
- **오늘 스터디 출석 체크인 카드** — 회차일 당일에만 자동 노출
  - "출석 체크" 버튼 → 서울 시간 기준 19:20 이전 = 출석 / 이후 = 지각
  - 체크 후 시각 + 상태 즉시 표시
  - 운영자 출결 확정(`confirm_session_attendance` RPC) 시 페널티 자동 적용 (기존 흐름 재사용)
- 운영자에 한해 사전참석 / 오늘 출석 서머리 카드 추가 (참석/불참/미응답, 출석/지각/결석/공결/미체크)

### 운영자 홈 (`/admin`) 개선
- 다음 회차 사전참석 서머리 카드 (참석/불참/미응답)
- 오늘 회차 출석 라이브 카드 + [상세 →] 링크 (`/admin/schedule/[id]/attendance` 로 바로 이동)

### 출석 자가 체크인 API
- `POST /api/attendance/check-in` — body: `{ session_id }`
  - 서울 시간으로 회차일과 오늘이 같은지 검증
  - 19:20 기준 present/late 자동 판정
  - 운영자가 이미 확정한 회차는 차단
  - attendances upsert (기존 행 있으면 status/checked_in_at 갱신)
- 운영자의 `/admin/schedule/[id]/attendance` 화면이 member self-check 결과를 그대로 보여주고, 필요 시 운영자가 override 가능

### 분기 정산서 (`/admin/finance/report`)
- **다음 분기 신청금액** 섹션 추가
  - 컬럼: 운영비(A) / 보증금(B) / 잔액(D) / **신청 = A+B-D** / 환불 / 상태
  - 활성 멤버: 잔액이 (운영비+보증금)보다 적으면 차액 신청, 많으면 차액 환불
  - 탈퇴 멤버: 잔액 전액 환불
  - 합계 행에 분기 신청 총액 / 환불 총액
- 22년 하반기 결산 양식의 산출식 그대로 반영

## 2026-05-09

### 마이그레이션 0008 - presenter_id 단수 전환 + 슬롯 예약 기반
- `presentations.presenter_ids UUID[]` → `presenter_id UUID` 단수 전환
  - 백필: 기존 첫 요소만 보존 (다인 슬롯은 첫 멤버 유지, 시드 검증으로 다인 0건 확인)
- `presentations.reserved_at TIMESTAMPTZ`, `company_updated_at TIMESTAMPTZ` 추가
- `presentations.presenter_id` FK 추가 (members.id, ON DELETE SET NULL)
- 분기당 1인 1발표 트리거 `trg_one_presentation_per_quarter` 추가
  - `current_setting('app.bypass_one_per_quarter')` 우회 옵션 + 멱등성을 위해 동일 presenter_id 업데이트는 스킵
- `presentation_reservation_logs` 테이블 추가 (action: reserve/release/transfer_in/transfer_out/company_update)
- `confirm_session_attendance` 함수 단수 컬럼으로 갱신

### 마이그레이션 0009 - 슬롯 예약 RPC
- `reserve_presentation_slot(p_member_id, p_presentation_id)`
  - FOR UPDATE 락 → 동시성 처리. 같은 분기 기존 예약 자동 이동 (transfer_out + transfer_in 로그)
  - event 회차 / 이미 점유된 슬롯 / 본인 동일 슬롯 거절
- `cancel_presentation_slot(p_member_id, p_presentation_id)` — 본인 슬롯만 release
- `update_presentation_company(p_member_id, p_presentation_id, p_company_name)` — 본인만 수정

### 코드 단수 전환
- `lib/types.ts`: `presenter_id: string | null` + `reserved_at` / `company_updated_at`
- 멤버 측: `attendance-response`, `evaluation-form`, `me` 페이지 모두 단수 비교
- 운영자 측: `schedule/session-row` (단수 발표자 셀렉트 + 빈 슬롯 옵션 + special_label 입력),
  `schedule/[sessionId]/attendance/attendance-checker`, `evaluations/page`, `evaluations/evaluation-results`,
  `finance/report` 단수 처리
- API: `/api/admin/presentations` (POST/PATCH), `/api/admin/schedule/import`, `/api/evaluations` 단수 입력
- `scripts/seed-data.ts` 단수로 갱신

### 멤버 [일정] 탭 (`/schedule`)
- 하단 네비에 [일정] 추가 (5개 탭: 홈/일정/출결/평가/내정보)
- 분기 선택기 + 활성 분기 기본
- **내 예약 요약 카드** (활성 분기 한정): 날짜/회차/슬롯/종목 강조
- 뷰 토글: **리스트** / **캘린더**
  - 리스트: 회차마다 슬롯 카드 (빈 🟢 / 내 ⭐ / 타인 👤 / special 🎉)
  - 캘린더: 자체 구현 월간 그리드. 슬롯 요약 배지 + 날짜 클릭 시 회차 상세 시트(BottomSheet)
- 60대 친화: 56px+ 버튼, 큰 폰트, 명확한 색 구분
- mutation 후 `router.refresh()` 로 서버 데이터 재페치
- 토스트(5초 자동 닫힘) + 슬롯 이동 확인 모달

### 슬롯 예약 API
- `POST /api/reservations/reserve` — RPC `reserve_presentation_slot` 래퍼
- `POST /api/reservations/cancel` — RPC `cancel_presentation_slot` 래퍼
- `POST /api/reservations/company` — RPC `update_presentation_company` 래퍼
- 모두 `getAuthedMember()` 로 인증, RPC 결과 success 플래그 검증 후 응답

### 운영자 일정 관리 (`/admin/schedule`)
- **여러 회차 일괄 등록** 폼 — 시작 날짜 + 회차 수 + 매주/격주 + 슬롯 수
  - 빈 슬롯(`presenter_id=NULL`) 으로 N개 일괄 생성
  - API: `POST /api/admin/sessions/bulk`
- 발표 폼: 발표자 셀렉트에 "🟢 빈 슬롯 (멤버 자율 예약)" 옵션 추가, special_label 인풋 추가
- **예약 이력** 페이지 (`/admin/schedule/logs`)
  - presentation_reservation_logs 분기 단위 조회 (최근 200건)
  - 분기/액션/멤버 필터
  - 액션 색 구분: 예약(녹) / 취소(적) / 이동(황) / 종목 변경(청)

## 2026-05-08

### 데이터 동기화 (npm run seed:data)
- 활성 멤버 17명 등록 (운영자 3: 이상호/양민기/이우재 + 일반 14)
- 비활성 멤버 15명 등록 (과거 발표 이력 보존용)
- 분기 13개 등록 (2022-Q2 ~ 2026-Q2, 활성 분기는 **2026-Q2**)
- 회차 97개 등록
- 발표 슬롯 195개 등록 (포트폴리오 발표 등 special 슬롯 포함)
- 기존 시드의 `26-2` 분기를 `2026-Q2` 로 자동 rename

### 마이그레이션 0006 - 회차/발표 확장
- `sessions.type` 에 `'event'` 추가 (휴식/회식/송년회 등 비발표 회차)
- `presentations.presenter_ids` NULL 허용 (special 슬롯)
- `presentations.special_label TEXT` 추가
- TypeScript 타입에 `event` 추가, presenter_ids 타입을 `string[] | null`로 확장
- 시드 스크립트 `scripts/seed-data.ts` (npm run seed:data) 신설
- `tsx` 개발 의존성 추가

### 마이그레이션 0007 - 평가 모듈 5개 항목 확장
- `evaluations` 에 `qna`, `time_management` 컬럼 추가 (NOT NULL, 1~5 CHECK)
  - 기존 행은 백필 시 `3('보통')` 으로 채워진 뒤 DEFAULT 제거
- `evaluations.feedback` NOT NULL 로 변경 (기존 NULL 은 빈 문자열 백필)
- `listener_feedbacks` 에 `UNIQUE(session_id, evaluator_id)` 제약 추가

### 평가 모듈 전면 개편 (멤버 화면 + API + 운영자 결과)
- 평가 항목: 3개 → 5개로 확장
  - preparation(준비) / delivery(진행) / qna(Q&A) / time_management(시간배분) / attractiveness(매력도)
  - 5단계 별점 (⭐⭐⭐⭐⭐ 매우 그렇다 ~ ⭐ 매우 그렇지 않다)
- 멤버 평가 화면 (`/evaluation`):
  - 한 발표자/한 화면 페이저 UI (이전/다음, 진행률 인디케이터)
  - 본인이 발표자인 슬롯은 자동 스킵 (별도 카드 노출 X)
  - presenter_ids 가 비어있는 special 슬롯도 자동 스킵
  - 5개 평가 + 종합 피드백 (필수)
  - 마지막 단계: 청취자 종합 피드백 (선택, 회차당 1건)
  - 완료 화면: "결과는 운영진이 별도 모임에서 안내" 안내문
  - 60대 친화: 56px+ 버튼, 큰 별 이모지, 명확한 라벨
- API 변경:
  - `POST /api/evaluations`: 5개 점수 + feedback 필수 검증, special 슬롯 거부
  - `POST /api/listener-feedback`: UNIQUE 제약 기반 upsert 로 단순화
- 운영자 결과 화면 (`/admin/evaluations`):
  - 탭: **회차별** / **발표자별 누적**
  - 회차별: 발표마다 5개 항목 평균 + 종합 평균 + 평가자 수 + 미응답자 명단(출석자 기준)
    - 펼치면 평가자별 5개 점수 + 종합 피드백 전체 노출
    - 청취자 종합 피드백 모아보기 (작성자 표기)
  - 발표자별 누적: 한 멤버의 분기 내 모든 발표 + 누적 5개 평균 + 회차별 평균 추이
- 정산서 (`/admin/finance/report`): 발표 평균 점수 산식 5개 항목 평균으로 갱신
- **평가 결과는 운영자 전용** — `/me` 페이지의 "내 발표 결과" 섹션 제거
  (분기 종료 후 운영진이 통합 정리해 별도 모임에서 안내한다는 안내문으로 대체)
