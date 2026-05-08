# 종로 가치 투자 스터디 앱 (jongatu-app)

JVI 스터디 운영자가 매주 수기로 처리하는 출결/평가/운영비/보증금을 통합 자동화하는 모바일 우선 웹앱.

- **인증**: 모든 사용자(스터디원 19명 + 운영자) 동일하게 이름 선택 + 본인 PIN 4자리. 운영자는 `members.is_admin = true` 플래그로 구분되어 동일 로그인으로 관리자 메뉴 자동 노출
- **스택**: Next.js 14 (App Router) · TailwindCSS · Supabase · Vercel

## 빠른 시작

### 1) Supabase 프로젝트 만들기

1. https://supabase.com 가입 후 New Project (이름: `jongatu-app`, region: Northeast Asia (Seoul) 권장)
2. 프로젝트 생성 후 좌측 **SQL Editor** 진입
3. `supabase/migrations/0001_initial.sql` 내용 전체 복사 → 붙여넣기 → **Run**
4. `supabase/migrations/0002_confirm_session.sql` 실행 (출결 확정 함수)
5. `supabase/migrations/0003_member_auth.sql` 실행 (멤버 PIN 인증 컬럼)
6. `supabase/migrations/0004_member_admin.sql` 실행 (운영자 권한 플래그)
7. `supabase/migrations/0005_member_recovery.sql` 실행 (PIN 분실 복구용 어머니 성함 컬럼)
8. `supabase/migrations/0006_event_type_and_special.sql` 실행 (event 회차 + special 발표 슬롯)
9. `supabase/migrations/0007_evaluation_extended.sql` 실행 (평가 5개 항목 + feedback 필수 + listener 회차당 1건)
10. `supabase/migrations/0008_presenter_singular_and_reservation.sql` 실행 (presenter_id 단수 + 예약 트리거 + 이력 테이블)
11. `supabase/migrations/0009_presentation_reservation_rpc.sql` 실행 (예약 RPC 3종)
12. `supabase/seed.sql` 실행 (페널티 + 26-2 분기 + placeholder 멤버 19명)
13. (선택) `npm run seed:data` 로 실제 멤버/분기/회차/발표 데이터 동기화
8. **첫 운영자 권한 부여** (멤버 명단에서 본인 이름 등록 후):
   ```sql
   UPDATE members SET is_admin = true WHERE name IN ('양민기', '이우재', '이상호');
   ```

### 2) 환경변수 설정

`.env.local.example` 을 복사해서 `.env.local` 로 저장:

```bash
cp .env.local.example .env.local
```

값 채우기:
- `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`
  Supabase 대시보드 → Project Settings → API 에서 복사

> 운영자 별도 PIN은 더 이상 필요 없습니다. 운영자도 멤버 명단에 등록되어 본인 PIN으로 로그인하며, `members.is_admin = true` 인 멤버만 관리자 메뉴에 진입합니다.

### 3) 개발 서버

```bash
npm install
npm run dev
```

http://localhost:3000

## 라우트

| 경로 | 설명 | 권한 |
|---|---|---|
| `/` | 스터디원 홈 (이름 선택 + 다음 회차) | 누구나 |
| `/schedule` | 일정 (분기 회차 + 슬롯 예약/이동/취소 + 종목 입력, 리스트/캘린더 토글) | 멤버 PIN |
| `/attendance` | 다음 회차 사전참석 응답 | 멤버 PIN |
| `/evaluation` | 직전 회차 발표 평가 + 청자 피드백 | 멤버 PIN |
| `/me` | 본인 보증금/출석 (평가 결과는 운영자 전용) | 멤버 PIN |
| `/admin` | 관리자 홈 | 멤버 PIN + is_admin |
| `/admin/members` | 스터디원 명단 CRUD + 권한/PIN 관리 | 멤버 PIN + is_admin |
| `/admin/schedule` | 분기/회차/발표 등록 + 일괄 회차 등록 | 멤버 PIN + is_admin |
| `/admin/schedule/import` | 엑셀로 회차/발표 일괄 등록 | 멤버 PIN + is_admin |
| `/admin/schedule/logs` | 슬롯 예약 이력 조회 | 멤버 PIN + is_admin |
| `/admin/schedule/[id]/attendance` | 출석체크 + 출결 확정 + 페널티 | 멤버 PIN + is_admin |
| `/admin/evaluations` | 분기 발표 평가 결과 모음 (회차별/발표자별 누적) | 멤버 PIN + is_admin |
| `/admin/finance` | 보증금 + 운영비 관리 | 멤버 PIN + is_admin |
| `/admin/finance/report` | 분기 정산서 (인쇄/PDF) | 멤버 PIN + is_admin |

## 진행 상황

- [x] **Phase 1** — 기반 (Next.js, DB 스키마, PIN 인증, 모바일 레이아웃, 멤버 CRUD)
- [x] **Phase 2** — 일정 (분기/회차/발표 등록 + 엑셀 임포트)
- [x] **Phase 3** — 출결 (사전참석 + 당일 출석체크 + 출결 확정 + 페널티 자동 적용)
- [x] **Phase 4** — 평가 (5축 별점 + 종합 피드백 + 청취자 종합 피드백 + 운영자 결과 조회 *발표자별 누적 포함*)
- [x] **Phase 5** — 정산 (개인 /me + 운영자 보증금/운영비 + 분기 정산서 인쇄)

## 디렉토리

```
app/
  (member)/         # 스터디원 화면 (하단 탭)
  admin/
    login/          # PIN 로그인 (no layout)
    (authed)/       # PIN 통과 후 진입 (admin 헤더)
  api/              # API routes (Node runtime)
components/
  ui/               # Button, Input, Label
  BottomNav.tsx
  MemberSelect.tsx
lib/
  auth.ts           # PIN bcrypt 검증
  constants.ts      # 쿠키 이름
  supabase/server.ts
  utils.ts
  types.ts
middleware.ts       # /admin/* + /api/admin/* PIN 가드
supabase/
  migrations/0001_initial.sql
  seed.sql
```

## Vercel 배포

1. GitHub에 push
2. https://vercel.com/new 에서 import
3. Environment Variables 에 `.env.local` 의 3개 값 복사
4. Deploy

## PRD 핵심 원칙

1. 카페를 대체하지 않는다 — 발표자료는 카페에 두고 앱은 URL만 저장
2. 60대 친화 UX 1순위 — 큰 버튼(56px+), 큰 글자(18px+), 적은 클릭
3. 운영진 반복 작업 자동화 — 사전참석 미응답/지각/결석 시 보증금 차감 + 운영비 자동 입금
4. 단순함이 최고 — 분기 시작에 일정만 등록하면 끝
