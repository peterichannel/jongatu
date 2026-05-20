-- 보증금/운영비 주기를 분기 → 반기로 정정 + 사전참석 미응답 페널티 비활성화
--
-- 정책 변경:
--   1. deposits / fund_transactions 의 기준 주기는 반기(half) 단위로 관리한다.
--      분기(quarter)는 발표 일정·회차 관리에만 계속 사용한다.
--   2. 사전참석 미등록(no_pre_attendance) 페널티는 카페 공지와 달리 실제로 차감하지 않으므로
--      penalty_rules 에서 is_active=false 로 토글하여 자동 적용을 끈다.
--
-- 변경 내용:
--   - halves 테이블 신규 (2026-H1, 2026-H2)
--   - deposits 에 half_id 컬럼 추가 → quarter_id 의 데이터를 half 매핑으로 백필
--     · 같은 멤버가 같은 반기 안에서 Q1·Q2 deposits 를 가지면 한 row 로 병합
--     · deposit_transactions 의 deposit_id 도 병합된 row 쪽으로 이동
--   - fund_transactions 에 half_id 컬럼 추가 → 동일 백필
--   - quarter_id 컬럼은 양쪽 모두 제거 (이후 코드는 half_id 만 참조)
--   - 페널티 함수 apply_attendance_penalty 재정의: half_id 기반 deposits ensure / fund_tx insert
--     · 사전참석 미응답 페널티 분기를 함수에서 영구 제거 (is_active=false 만으로는 COALESCE 가 -3000 으로 살아나서)
--   - penalty_rules 'no_pre_attendance' is_active=false

BEGIN;

-- ───────────────────────────────────────────────
-- 1) halves 테이블 + 2026 반기 시드
-- ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS halves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  default_deposit INTEGER NOT NULL DEFAULT 45000,
  default_operating_fee INTEGER NOT NULL DEFAULT 45000,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO halves (name, start_date, end_date, is_active) VALUES
  ('2026-H1', '2026-01-01', '2026-06-30', true),
  ('2026-H2', '2026-07-01', '2026-12-31', false)
ON CONFLICT (name) DO NOTHING;

-- ───────────────────────────────────────────────
-- 2) deposits 에 half_id 컬럼 + 백필
-- ───────────────────────────────────────────────
ALTER TABLE deposits ADD COLUMN IF NOT EXISTS half_id UUID REFERENCES halves(id) ON DELETE CASCADE;

UPDATE deposits d
   SET half_id = h.id
  FROM quarters q, halves h
 WHERE d.quarter_id = q.id
   AND q.start_date <= h.end_date
   AND q.end_date   >= h.start_date
   AND d.half_id IS NULL;

-- 같은 (member_id, half_id) 가 여러 row 이면 한 row 로 병합
DO $$
DECLARE
  v_pair  RECORD;
  v_canon UUID;
  v_delta INTEGER;
BEGIN
  FOR v_pair IN
    SELECT member_id, half_id
      FROM deposits
     WHERE half_id IS NOT NULL
     GROUP BY member_id, half_id
    HAVING COUNT(*) > 1
  LOOP
    -- 가장 이른 분기 = 정본
    SELECT d.id INTO v_canon
      FROM deposits d
      JOIN quarters q ON q.id = d.quarter_id
     WHERE d.member_id = v_pair.member_id
       AND d.half_id   = v_pair.half_id
     ORDER BY q.start_date ASC, d.id ASC
     LIMIT 1;

    -- 합산 잔액 = 45,000 + 모든 row 의 (current_balance - initial_amount)
    --   각 row 의 initial_amount 가 별도 45,000 이라도 한 번만 인정
    SELECT COALESCE(SUM(current_balance - initial_amount), 0)
      INTO v_delta
      FROM deposits
     WHERE member_id = v_pair.member_id
       AND half_id   = v_pair.half_id;

    -- 비정본 row 의 deposit_transactions 를 정본 쪽으로 이동
    UPDATE deposit_transactions dt
       SET deposit_id = v_canon
     WHERE dt.deposit_id IN (
       SELECT id FROM deposits
        WHERE member_id = v_pair.member_id
          AND half_id   = v_pair.half_id
          AND id <> v_canon
     );

    -- 비정본 row 삭제
    DELETE FROM deposits
     WHERE member_id = v_pair.member_id
       AND half_id   = v_pair.half_id
       AND id <> v_canon;

    -- 정본 row 의 (initial, balance) 정정 — 시작 잔액 45,000 단일 적용
    UPDATE deposits
       SET initial_amount  = 45000,
           current_balance = 45000 + v_delta
     WHERE id = v_canon;
  END LOOP;
END $$;

-- 유니크 제약 교체: (member, quarter) → (member, half)
ALTER TABLE deposits DROP CONSTRAINT IF EXISTS deposits_member_id_quarter_id_key;
ALTER TABLE deposits ADD CONSTRAINT deposits_member_id_half_id_key UNIQUE (member_id, half_id);

-- quarter_id 컬럼 / 인덱스 제거
DROP INDEX IF EXISTS idx_deposits_quarter;
ALTER TABLE deposits DROP COLUMN IF EXISTS quarter_id;
ALTER TABLE deposits ALTER COLUMN half_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_deposits_half ON deposits(half_id);

-- ───────────────────────────────────────────────
-- 3) fund_transactions 에 half_id 컬럼 + 백필
-- ───────────────────────────────────────────────
ALTER TABLE fund_transactions ADD COLUMN IF NOT EXISTS half_id UUID REFERENCES halves(id) ON DELETE CASCADE;

UPDATE fund_transactions ft
   SET half_id = h.id
  FROM quarters q, halves h
 WHERE ft.quarter_id = q.id
   AND q.start_date <= h.end_date
   AND q.end_date   >= h.start_date
   AND ft.half_id IS NULL;

DROP INDEX IF EXISTS idx_fund_tx_quarter;
ALTER TABLE fund_transactions DROP COLUMN IF EXISTS quarter_id;
ALTER TABLE fund_transactions ALTER COLUMN half_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fund_tx_half ON fund_transactions(half_id);

-- ───────────────────────────────────────────────
-- 4) penalty_rules: no_pre_attendance 자동 차감 끄기
--    규칙 row 는 보존 (운영진이 토글로 다시 켤 수 있도록)
-- ───────────────────────────────────────────────
UPDATE penalty_rules SET is_active = false WHERE rule_key = 'no_pre_attendance';

-- ───────────────────────────────────────────────
-- 5) apply_attendance_penalty 재정의 (half_id 기반 + 사전참석 페널티 분기 제거)
-- ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION apply_attendance_penalty(
  p_session_id UUID,
  p_member_id  UUID
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_session    sessions%ROWTYPE;
  v_half       halves%ROWTYPE;
  v_member     members%ROWTYPE;
  v_attendance attendances%ROWTYPE;
  v_attendance_found boolean;
  v_is_presenter boolean;
  v_deposit_id uuid;
  v_old_dep_amount int;

  v_amount_late int;
  v_amount_absent int;
  v_amount_no_present int;
  v_total_applied int := 0;
BEGIN
  SELECT * INTO v_session FROM sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '회차를 찾을 수 없습니다';
  END IF;
  IF v_session.type != 'normal' THEN
    RETURN jsonb_build_object('skipped', 'non_normal_session');
  END IF;
  IF v_session.is_test THEN
    RETURN jsonb_build_object('skipped', 'test_session');
  END IF;

  SELECT * INTO v_member FROM members WHERE id = p_member_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '멤버를 찾을 수 없습니다';
  END IF;

  -- 회차 날짜가 속한 반기를 찾는다 (없으면 예외)
  SELECT * INTO v_half FROM halves
   WHERE v_session.date BETWEEN start_date AND end_date
   LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION '세션 날짜(%)에 해당하는 반기가 없습니다', v_session.date;
  END IF;

  SELECT * INTO v_attendance FROM attendances
    WHERE session_id = p_session_id AND member_id = p_member_id;
  v_attendance_found := FOUND;

  -- deposits ensure (half_id 기준)
  SELECT id INTO v_deposit_id FROM deposits
    WHERE member_id = p_member_id AND half_id = v_half.id;
  IF v_deposit_id IS NULL THEN
    INSERT INTO deposits (member_id, half_id, initial_amount, current_balance)
    VALUES (p_member_id, v_half.id, v_half.default_deposit, v_half.default_deposit)
    RETURNING id INTO v_deposit_id;
  END IF;

  -- 페널티 금액 조회 (no_pre_attendance 는 더 이상 사용하지 않음)
  SELECT amount INTO v_amount_late       FROM penalty_rules WHERE rule_key = 'late'       AND is_active = true;
  SELECT amount INTO v_amount_absent     FROM penalty_rules WHERE rule_key = 'absent'     AND is_active = true;
  SELECT amount INTO v_amount_no_present FROM penalty_rules WHERE rule_key = 'no_present' AND is_active = true;
  v_amount_late       := COALESCE(v_amount_late,       -3000);
  v_amount_absent     := COALESCE(v_amount_absent,     -10000);
  v_amount_no_present := COALESCE(v_amount_no_present, -30000);

  -- 기존 페널티 reversal: 지각/결석/발표 미수행 + (남아있을 수 있는) 사전참석확인 미등록
  SELECT COALESCE(SUM(amount), 0) INTO v_old_dep_amount
    FROM deposit_transactions
   WHERE deposit_id = v_deposit_id
     AND reference_type = 'attendance'
     AND reference_id   = p_session_id
     AND reason IN ('지각', '결석', '발표 미수행', '사전참석확인 미등록');

  IF v_old_dep_amount <> 0 THEN
    UPDATE deposits SET current_balance = current_balance - v_old_dep_amount WHERE id = v_deposit_id;
  END IF;

  DELETE FROM deposit_transactions
   WHERE deposit_id = v_deposit_id
     AND reference_type = 'attendance'
     AND reference_id   = p_session_id
     AND reason IN ('지각', '결석', '발표 미수행', '사전참석확인 미등록');

  DELETE FROM fund_transactions
   WHERE reference_type = 'attendance'
     AND reference_id   = p_session_id
     AND member_id      = p_member_id
     AND category       = 'penalty';

  -- attendance 페널티 (attendance 행이 있을 때만)
  IF v_attendance_found THEN
    SELECT EXISTS(
      SELECT 1 FROM presentations
       WHERE session_id = p_session_id AND presenter_id = p_member_id
    ) INTO v_is_presenter;

    IF v_attendance.status = 'late' THEN
      INSERT INTO deposit_transactions (deposit_id, amount, reason, reference_type, reference_id)
      VALUES (v_deposit_id, v_amount_late, '지각', 'attendance', p_session_id);
      UPDATE deposits SET current_balance = current_balance + v_amount_late WHERE id = v_deposit_id;
      INSERT INTO fund_transactions (half_id, amount, category, description, date, reference_type, reference_id, member_id)
      VALUES (v_half.id, abs(v_amount_late), 'penalty',
              v_member.name || ' 지각 (' || v_session.session_number || '회차)',
              v_session.date, 'attendance', p_session_id, p_member_id);
      v_total_applied := v_total_applied + abs(v_amount_late);

    ELSIF v_attendance.status = 'absent' THEN
      INSERT INTO deposit_transactions (deposit_id, amount, reason, reference_type, reference_id)
      VALUES (v_deposit_id, v_amount_absent, '결석', 'attendance', p_session_id);
      UPDATE deposits SET current_balance = current_balance + v_amount_absent WHERE id = v_deposit_id;
      INSERT INTO fund_transactions (half_id, amount, category, description, date, reference_type, reference_id, member_id)
      VALUES (v_half.id, abs(v_amount_absent), 'penalty',
              v_member.name || ' 결석 (' || v_session.session_number || '회차)',
              v_session.date, 'attendance', p_session_id, p_member_id);
      v_total_applied := v_total_applied + abs(v_amount_absent);

      IF v_is_presenter THEN
        INSERT INTO deposit_transactions (deposit_id, amount, reason, reference_type, reference_id)
        VALUES (v_deposit_id, v_amount_no_present, '발표 미수행', 'attendance', p_session_id);
        UPDATE deposits SET current_balance = current_balance + v_amount_no_present WHERE id = v_deposit_id;
        INSERT INTO fund_transactions (half_id, amount, category, description, date, reference_type, reference_id, member_id)
        VALUES (v_half.id, abs(v_amount_no_present), 'penalty',
                v_member.name || ' 발표 미수행 (' || v_session.session_number || '회차)',
                v_session.date, 'attendance', p_session_id, p_member_id);
        v_total_applied := v_total_applied + abs(v_amount_no_present);
      END IF;
    END IF;
    -- 'present', 'excused' → attendance 페널티 없음
  END IF;

  -- 사전참석 미응답 분기는 정책 변경으로 영구 제거.
  -- penalty_rules.no_pre_attendance 는 보존하되 이 함수에서 더 이상 참조하지 않는다.

  RETURN jsonb_build_object(
    'session_id',        p_session_id,
    'member_id',         p_member_id,
    'attendance_status', v_attendance.status,
    'applied',           v_total_applied,
    'half',              v_half.name
  );
END;
$$;

COMMIT;

-- ───────────────────────────────────────────────
-- 검증 SQL (마이그레이션 실행 후 수동으로 돌려보기)
-- ───────────────────────────────────────────────
-- 1) halves 시드 확인
--    SELECT * FROM halves ORDER BY start_date;
--
-- 2) 활성 멤버의 2026-H1 잔액 (양민기/이우재 포함 17명 모두 표시)
--    SELECT m.name, d.initial_amount, d.current_balance,
--           d.initial_amount - d.current_balance AS total_penalty
--      FROM members m
--      JOIN deposits d ON d.member_id = m.id
--      JOIN halves   h ON h.id = d.half_id
--     WHERE m.is_active = true AND h.name = '2026-H1'
--     ORDER BY d.current_balance ASC, m.name;
--
--    기대 결과:
--      김동주/김영호/박성철            45,000 (페널티 0)
--      서유나                          35,000 (-10,000)
--      서수민/이신우/이애리/임지향     25,000 (-20,000)
--      이상호/김윤정                   16,000 (-29,000)
--      양민기/이우재/박경환/강성민     15,000 (-30,000)
--      유병우/이종명                   12,000 (-33,000)
--      최수진                           2,000 (-43,000)
--    합계 페널티 -377,000원
--
-- 3) fund_transactions 카테고리별 합계 (2026-H1)
--    SELECT category, SUM(amount)
--      FROM fund_transactions ft
--      JOIN halves h ON h.id = ft.half_id
--     WHERE h.name = '2026-H1'
--     GROUP BY category
--     ORDER BY category;
--
--    기대: penalty 377,000 / membership 675,000 (운영진 2명 면제, 15명 × 45,000)
--
-- 4) no_pre_attendance 페널티 규칙이 비활성인지
--    SELECT rule_key, is_active FROM penalty_rules WHERE rule_key = 'no_pre_attendance';
--    → is_active = false
--
-- 5) 26-H1 기간 동안 사전참석 미등록 거래가 0건인지
--    SELECT count(*) FROM deposit_transactions
--     WHERE reason = '사전참석확인 미등록'
--       AND created_at >= '2026-01-01' AND created_at <= '2026-06-30';
--    → 0
