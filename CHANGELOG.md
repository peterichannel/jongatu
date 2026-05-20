# CHANGELOG

## 2026-05-20

### 보증금/운영비 주기를 분기에서 반기로 변경
- 운영진 정책 정정: 보증금·운영비는 반기(2026-H1, 2026-H2) 단위로 관리. 분기는 발표 일정·회차 관리에만 사용.
- DB: `halves` 테이블 신규. `deposits`, `fund_transactions` 의 `quarter_id` → `half_id` 로 교체하며 Q1·Q2 row 가 같은 멤버에 중복되면 H1 하나로 병합(시작잔액 45,000원 단일 적용, deposit_transactions 재매핑).
- 페널티 함수 `apply_attendance_penalty`: 회차 날짜로 반기를 찾아 deposits/fund_transactions ensure·insert.
- UI: `/admin/finance`, `/admin/finance/report`, `/me`(분기 선택 → 반기 선택)이 모두 활성 반기 기준으로 잔액·정산 표시.

### 사전참석 미등록 페널티 자동 차감 비활성화
- `penalty_rules.no_pre_attendance` 를 `is_active=false` 로 토글 (규칙 row 는 보존, 추후 토글로 재활성 가능).
- `apply_attendance_penalty` 에서 사전참석 미응답 분기 영구 제거(COALESCE 잔재로 -3,000원이 살아나지 않도록).
- 운영자 홈 "사전참석 미응답자 재안내" 카드 톤 정정 — 빨간 강조/마감 임박 표현을 호박색 + 인원 파악 부탁 톤으로 교체.

## 2026-05-09 (밤)

### 홈/내정보 페이지 역할 분리 (액션 vs 조회)
설계 원칙:
- **홈(/)** = 액션 트리거 (지금 뭐 해야 하지?)
- **내 정보(/me)** = 데이터 조회 (내 상태 확인)

#### 홈(/) 재구성 — 액션 중심
- 인사말 + 다음 스터디 정보(날짜/요일/회차/발표자)를 상단 한 카드로 통합
- **"지금 해야 할 일"** 시간 기반 액션 카드 (조건 안 맞으면 카드 숨김):
  - ✓ 사전참석 답하기 — 다음 회차 D-2~D-1 + 본인 미응답
  - 📍 오늘 출석 체크 — 당일 18:30~20:00 + 본인 미체크
  - ⭐ 이번주 평가하기 — 평가 대상 회차(어제 이전 가장 최근 normal) + 본인 미완료 건수>0 + 다음 회차 D-2 전
- **"─── 운영자 액션 ───"** 섹션 (`is_admin=true` 가드, 첫 카드 = 관리자 메뉴 진입):
  - 📢 **사전참석 안내 메시지** (D-2~D-1) — 발표자/마감일 자동 채움 메시지 + 복사/공유 버튼
  - 📢 **사전참석 미응답자 재안내** (D-1 + 미응답 1명 이상) — 빨간색 강조, 미응답자 명단 자동 추출
  - 📢 **출석 안내 메시지** (당일 18:00~18:30) — 단톡방용 짧은 안내
  - ⏰ **출결 확정 알림** — 미확정인 가장 최근 종료 회차로 `/admin/schedule/[id]/attendance` 진입
- **내 정보 미리보기** (페이지 맨 하단) — 보증금 잔액 + 이번 분기 출석률 + "내 정보 자세히 보기 →" 버튼
- 제거: (운영자) 사전참석/오늘 출석 서머리 카드 — 이미 `/admin`에 있음

#### /me 재구성 — 조회 중심
- **본인 프로필 카드** 추가 — 아바타 + 이름 + 운영자/멤버 뱃지 + 가입일
- **발표 이력 카드** 추가 — 본인 발표자 슬롯 전부, 분기 무관, 날짜순 (최신→과거)
- **받은 평가 카드** 추가 — 본인 발표 슬롯의 evaluations 그룹핑
  - 누적 평균 (5항목 × N명 × M회차)
  - 회차별 `<details>` 토글: 5항목 평균(준비/진행/Q&A/시간/매력도) + 종합 피드백 모음
- 운영자 메뉴 카드 제거 (홈으로 이전 — 이중 노출 방지)

#### 공통
- `components/CopyShareButtons.tsx` (client) 신규 — `navigator.clipboard.writeText` + textarea fallback. `navigator.share` 시도 후 폴백 자동 복사. 복사 성공 5초 "복사됨" 라벨. 56px+ 버튼. 빨간색(`variant=danger`) 옵션
- `lib/seoul-time.ts` `addDaysSeoulISO(date, days)` 헬퍼 추가
- 메시지 URL은 `NEXT_PUBLIC_SITE_URL` env (없으면 안내 줄 생략)

#### 검증 시나리오
- 일반 멤버 계정 홈: 운영자 카드 4종 모두 안 보임 ✓ (서버에서 `is_admin` 체크)
- 운영자 계정 + 다음 회차 D-2: 사전참석 안내 + (모든 멤버용) 사전참석 답하기 카드 노출
- 시간 윈도우 외 진입: 해당 카드 자동 숨김
- 메시지 복사 후 "복사됨" 5초 노출

### 출결 페이지 (`/attendance`) 재구성
- 기존엔 "다음 회차 1개"만 다뤘는데, 오늘 회차와 다음(미래) 회차를 별도 카드로 분리:
  - **오늘 회차**: 자가 체크인 영역(amber 카드, 강조) + 사전참석 응답
    - 사전참석을 이미 응답한 경우엔 한 줄 요약(✓ 참석 / ✗ 불참 + 변경) 으로 축소 — 출석 체크가 메인
    - 사전참석에서 `absent`로 응답했어도 자가 체크인 가능 + 안내 문구("불참 응답이지만 출석 체크 시 출석/지각으로 기록되며 결석 페널티는 부과되지 않습니다")
  - **다음 회차** (미래): 사전참석 응답만(green 카드)
- 발표 슬롯 정보는 두 카드 각각에 표시
- `attendance-response.tsx` `SessionPanel` / `PreAttendanceArea` / `CheckedInStatus` 서브컴포넌트로 재구성

### Asia/Seoul 시각 처리 통합 (`lib/seoul-time.ts`)
- 기존 `seoulNow()` / `todayISOInSeoul()` 헬퍼들이 `getTimezoneOffset()` 기반이라 서버/실행 환경에 따라 결과가 9시간 어긋날 위험. dev 모드(KST 로컬) 테스트 시 자가 체크인의 출석/지각 판정이 잘못 나올 수 있는 문제
- **`lib/seoul-time.ts`** 신규 — `Intl.DateTimeFormat({ timeZone: 'Asia/Seoul' })` 기반의 환경 무관한 헬퍼 3종: `seoulDateISO()`, `seoulHourMinute()`, `seoulMinutesOfDay()`
- 적용 대체:
  - `app/api/attendance/check-in/route.ts` — `seoulNow()` 제거, `seoulDateISO()` + `seoulMinutesOfDay()` 사용. `checked_in_at`은 그대로 UTC ISO (표시 단계에서 KST 변환)
  - `app/api/pre-attendance/route.ts` — `seoulDateISO()`
  - `app/(member)/page.tsx`, `app/(member)/attendance/page.tsx`, `app/(member)/evaluation/page.tsx`, `app/(member)/schedule/schedule-view.tsx`, `app/admin/(authed)/page.tsx` — 자체 `todayISO*` 제거 후 통합 헬퍼로 교체
  - `lib/utils.ts` `todayISO` — KST `Intl.DateTimeFormat` 기반으로 재작성 (이름 유지, 기존 호출자 영향 없음)
  - `app/admin/(authed)/finance/finance-manager.tsx`, `app/api/admin/members/route.ts` — 폼 초기 날짜를 KST 기준으로
  - `app/(member)/me/transaction-list.tsx` `formatShort` — `timeZone: 'Asia/Seoul'` 명시
  - `scripts/create-test-session.ts` — 동일

### 내정보 페이지 (`/me`) 개편
- **운영자 메뉴 카드** 추가 — 운영진(`is_admin=true`)에게 홈과 동일한 "관리자 메뉴" 진입 카드 노출 (`/admin`)
- **분기 선택** — `?quarter=...` searchParam 기반. `QuarterSelector`(client) 추가, 일정 페이지와 동일한 패턴. 기본값은 활성 분기, 그 외 분기 선택 시 보증금/출석/페널티 프리뷰가 해당 분기 기준으로 재조회
- **출석률** — `(출석 + 지각) / 체크된 회차 × 100` 카드 추가. 정상 회차 수와 체크 횟수도 함께 표기 (`is_test=true` 회차는 정상 회차에서 제외)
- 하단의 "발표 평가 결과는 분기 종료 후..." 안내 문구 제거

### UX 개선 3종 (이슈 1/2/3)
- **평가 페이지 진행 상태 복원** (`evaluation-form.tsx`) — 데이터 로드 후 `step` 자동 계산. 발표자 모두 평가 + 청취자 피드백 저장 시 done 화면, 일부만 저장 시 미완료 첫 발표자, 청취자만 미작성 시 청취자 단계로 이동. (이전엔 항상 첫 발표자부터 다시 시작)
- **내정보 페이지 페널티 프리뷰** (`me/page.tsx`) — 미확정 attendances의 late/absent를 모아 "확정 대기 N건 + 예상 추가 차감 + 확정 후 예상 잔액" 카드 추가. 자가 체크인 직후 보증금 영향을 즉시 가시화 (실제 차감은 운영자 확정 시점). `is_test` 회차 + presenter 미수행 페널티는 프리뷰에서 제외(혼선 방지).
- **페이지 전환 체감 개선**:
  - `app/(member)/loading.tsx` 추가 — 탭 전환 시 즉시 스켈레톤 노출 (이전엔 SSR 끝날 때까지 이전 화면이 그대로 멈춰 보임)
  - `BottomNav` `useTransition` + 옵티미스틱 `pendingHref` — 클릭 즉시 활성 탭 색상 + 아이콘 펄스 애니메이션으로 시각 피드백

### 테스트 회차 시각적 구분 (🧪 테스트 뱃지)
- `is_test=true` 회차가 운영진 화면에서 일반 회차와 즉시 구분되도록 보라색 뱃지/배경을 일관되게 적용
- 적용 위치:
  - 멤버 홈(`/`) — 오늘/다음 스터디 카드 헤더
  - 출결(`/attendance`) — 다음 스터디 카드
  - 일정(`/schedule`) — 리스트 회차 블록 헤더(보라 보더+배경) + 캘린더 셀(보라 배경) + 시트 헤더 + 범례
  - 운영자 분기 일정(`/admin/schedule`) — `SessionRow` 좌측 회차 칩 + 날짜 옆 뱃지
  - 운영자 출석체크(`/admin/schedule/[id]/attendance`) — 헤더 뱃지 + "테스트 회차입니다 (페널티 미생성, 일반 멤버 비노출)" 안내 박스

### 회차별 지각 판정 기준 (`late_after_minutes`)
- **마이그레이션 0013**: `sessions.late_after_minutes INTEGER` (nullable) 추가
  - NULL이면 기본 19:20 (`DEFAULT_LATE_MINUTES = 1160`) 사용
  - 값이 있으면 자정 기준 분 단위로 그 시각 이후를 지각으로 판정 (예: 16:30 = `990`)
- **자가 체크인 API** (`app/api/attendance/check-in/route.ts`): 회차의 `late_after_minutes` 우선 사용, 없으면 19:20 기본값
- **홈 카드 안내문**: 하드코딩 "19시 20분" → 회차 값 기반 동적 표시 (예: "16시 30분 이후 = 지각")
- **`scripts/create-test-session.ts`**: 테스트 회차에 `late_after_minutes=990 (16:30)` + note `'테스트 회차 (16:30 이후 = 지각)'`. 기존 #9999 회차가 있으면 오늘 날짜 + 16:30 기준으로 강제 갱신
- 일반 회차는 영향 없음 (NULL → 19:20 그대로)

### 일정 페이지 (`/schedule`) UX 개선
- **리스트 뷰**: 오늘(Asia/Seoul) 기준으로 회차를 분리
  - 다가오는 회차 (오늘 포함 이후)는 그대로 노출 — 다음 발표가 맨 위에 보임
  - 지난 회차는 "지난 회차 N건" 아코디언으로 접어둠 (기본 닫힘 상태, 클릭 시 펼침)
- **캘린더 뷰**: 진입 시 오늘 날짜가 포함된 달부터 표시 (분기 범위를 벗어나면 가장 가까운 달)
- 오늘 셀에 amber 링 + 텍스트 강조, 범례에도 "오늘" 항목 추가

### 테스트 회차 인프라 (is_test 가드)
- 운영진끼리 자가 체크인/사전참석/출결 확정 흐름을 안전하게 검증할 수 있는 별도 회차
- **마이그레이션 0011**:
  - `sessions.is_test BOOLEAN NOT NULL DEFAULT false` 추가 (기존 회차 모두 false)
  - `confirm_session_attendance` RPC 갱신 — `is_test=true` 회차는 페널티 트랜잭션을 생성하지 않고 attendances 확정만 처리 (`total_penalties: 0` 반환). 테스트 데이터가 진짜 보증금/운영비에 영향을 주지 않음
- **멤버측 가드** — 비운영진(`is_admin=false`)에게는 `is_test=true` 회차가 모두 숨겨짐:
  - `app/(member)/page.tsx` (오늘/다음 스터디 카드)
  - `app/(member)/attendance/page.tsx` (사전참석)
  - `app/(member)/schedule/page.tsx` (분기 일정)
  - `app/api/attendance/check-in/route.ts` (자가 체크인 — 비운영진 403)
  - `app/api/pre-attendance/route.ts` (사전참석 응답 — 비운영진 403)
  - 운영진은 모든 곳에서 그대로 보이고 자가 체크인까지 가능
- **스크립트**:
  - `scripts/create-test-session.ts` — 활성 분기 + 오늘 날짜 + `session_number=9999` + `is_test=true, type='normal'` 로 INSERT (이미 #9999 있으면 오늘 날짜로 갱신)
  - `scripts/delete-test-sessions.ts` — `is_test=true` 회차 + 보수적으로 매핑된 deposit_transactions 정리 (CASCADE 로 attendances/pre_attendances/presentations 동반 삭제)
- 운영자 UI 토글은 미추가 — 진짜 필요해질 때 추가
- `Session` 타입에 `is_test: boolean` 추가

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
