-- 슬롯 예약 시스템 기반 스키마
-- 1) presentations.presenter_ids UUID[] → presenter_id UUID 단수 전환
-- 2) reserved_at, company_updated_at 컬럼 추가
-- 3) 분기당 1인 1회 발표 제약 (트리거)
-- 4) 예약 이력 테이블 presentation_reservation_logs
-- 5) confirm_session_attendance 함수 갱신 (presenter_ids → presenter_id)
--
-- 실행 후 0002 의 옛 함수는 완전히 대체됩니다.

-- ── 1) presenter_id 단수 컬럼 + 백필 ──
ALTER TABLE presentations ADD COLUMN IF NOT EXISTS presenter_id UUID;

-- 2명 이상 등록된 슬롯이 있으면 첫 멤버만 남게 됨 — 운영자가 사후 정리 필요. 경고 출력.
DO $$
DECLARE
  v_multi_count INTEGER;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'presentations' AND column_name = 'presenter_ids'
  ) THEN
    SELECT COUNT(*) INTO v_multi_count
    FROM presentations
    WHERE presenter_ids IS NOT NULL AND array_length(presenter_ids, 1) >= 2;
    IF v_multi_count > 0 THEN
      RAISE NOTICE '경고: 다인 발표 행 %개 발견 — 첫 멤버만 보존됩니다.', v_multi_count;
    END IF;

    UPDATE presentations
    SET presenter_id = presenter_ids[1]
    WHERE presenter_id IS NULL
      AND presenter_ids IS NOT NULL
      AND array_length(presenter_ids, 1) >= 1;
  END IF;
END $$;

-- FK
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'presentations_presenter_id_fkey'
  ) THEN
    ALTER TABLE presentations
      ADD CONSTRAINT presentations_presenter_id_fkey
      FOREIGN KEY (presenter_id) REFERENCES members(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── 2) 예약 시점 + 종목 수정 시점 ──
ALTER TABLE presentations ADD COLUMN IF NOT EXISTS reserved_at TIMESTAMPTZ;
ALTER TABLE presentations ADD COLUMN IF NOT EXISTS company_updated_at TIMESTAMPTZ;

-- ── 3) confirm_session_attendance 함수 갱신 (presenter_id 단수) ──
CREATE OR REPLACE FUNCTION confirm_session_attendance(p_session_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_session sessions%ROWTYPE;
  v_quarter quarters%ROWTYPE;
  v_already_confirmed boolean;
  v_member RECORD;
  v_attendance attendances%ROWTYPE;
  v_pre pre_attendances%ROWTYPE;
  v_is_presenter boolean;
  v_deposit_id uuid;
  v_unchecked_count int;
  v_total_penalties int := 0;

  v_amount_no_pre int;
  v_amount_late int;
  v_amount_absent int;
  v_amount_no_present int;
BEGIN
  SELECT * INTO v_session FROM sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '회차를 찾을 수 없습니다';
  END IF;
  IF v_session.type != 'normal' THEN
    RAISE EXCEPTION '정상 회차만 확정할 수 있습니다';
  END IF;

  SELECT * INTO v_quarter FROM quarters WHERE id = v_session.quarter_id;

  SELECT EXISTS(
    SELECT 1 FROM attendances WHERE session_id = p_session_id AND is_confirmed = true
  ) INTO v_already_confirmed;
  IF v_already_confirmed THEN
    RAISE EXCEPTION '이미 확정된 회차입니다';
  END IF;

  SELECT count(*) INTO v_unchecked_count FROM members m
  WHERE m.is_active = true
    AND NOT EXISTS(
      SELECT 1 FROM attendances a WHERE a.session_id = p_session_id AND a.member_id = m.id
    );
  IF v_unchecked_count > 0 THEN
    RAISE EXCEPTION '미체크 멤버가 % 명 있습니다', v_unchecked_count;
  END IF;

  SELECT amount INTO v_amount_no_pre FROM penalty_rules WHERE rule_key = 'no_pre_attendance' AND is_active = true;
  SELECT amount INTO v_amount_late FROM penalty_rules WHERE rule_key = 'late' AND is_active = true;
  SELECT amount INTO v_amount_absent FROM penalty_rules WHERE rule_key = 'absent' AND is_active = true;
  SELECT amount INTO v_amount_no_present FROM penalty_rules WHERE rule_key = 'no_present' AND is_active = true;

  v_amount_no_pre     := COALESCE(v_amount_no_pre, -3000);
  v_amount_late       := COALESCE(v_amount_late, -3000);
  v_amount_absent     := COALESCE(v_amount_absent, -10000);
  v_amount_no_present := COALESCE(v_amount_no_present, -30000);

  FOR v_member IN SELECT * FROM members WHERE is_active = true LOOP
    SELECT * INTO v_attendance FROM attendances
      WHERE session_id = p_session_id AND member_id = v_member.id;
    SELECT * INTO v_pre FROM pre_attendances
      WHERE session_id = p_session_id AND member_id = v_member.id;

    SELECT EXISTS(
      SELECT 1 FROM presentations
      WHERE session_id = p_session_id AND presenter_id = v_member.id
    ) INTO v_is_presenter;

    SELECT id INTO v_deposit_id FROM deposits
      WHERE member_id = v_member.id AND quarter_id = v_session.quarter_id;
    IF v_deposit_id IS NULL THEN
      INSERT INTO deposits (member_id, quarter_id, initial_amount, current_balance)
      VALUES (v_member.id, v_session.quarter_id, v_quarter.default_deposit, v_quarter.default_deposit)
      RETURNING id INTO v_deposit_id;
    END IF;

    IF v_pre.id IS NULL THEN
      INSERT INTO deposit_transactions (deposit_id, amount, reason, reference_type, reference_id)
      VALUES (v_deposit_id, v_amount_no_pre, '사전참석확인 미등록', 'attendance', p_session_id);
      UPDATE deposits SET current_balance = current_balance + v_amount_no_pre WHERE id = v_deposit_id;
      INSERT INTO fund_transactions (quarter_id, amount, category, description, date)
      VALUES (v_session.quarter_id, abs(v_amount_no_pre), 'penalty', v_member.name || ' 사전참석 미응답 (' || v_session.session_number || '회차)', v_session.date);
      v_total_penalties := v_total_penalties + abs(v_amount_no_pre);
    END IF;

    IF v_attendance.status = 'absent' THEN
      INSERT INTO deposit_transactions (deposit_id, amount, reason, reference_type, reference_id)
      VALUES (v_deposit_id, v_amount_absent, '결석', 'attendance', p_session_id);
      UPDATE deposits SET current_balance = current_balance + v_amount_absent WHERE id = v_deposit_id;
      INSERT INTO fund_transactions (quarter_id, amount, category, description, date)
      VALUES (v_session.quarter_id, abs(v_amount_absent), 'penalty', v_member.name || ' 결석 (' || v_session.session_number || '회차)', v_session.date);
      v_total_penalties := v_total_penalties + abs(v_amount_absent);
    END IF;

    IF v_attendance.status = 'late' THEN
      INSERT INTO deposit_transactions (deposit_id, amount, reason, reference_type, reference_id)
      VALUES (v_deposit_id, v_amount_late, '지각', 'attendance', p_session_id);
      UPDATE deposits SET current_balance = current_balance + v_amount_late WHERE id = v_deposit_id;
      INSERT INTO fund_transactions (quarter_id, amount, category, description, date)
      VALUES (v_session.quarter_id, abs(v_amount_late), 'penalty', v_member.name || ' 지각 (' || v_session.session_number || '회차)', v_session.date);
      v_total_penalties := v_total_penalties + abs(v_amount_late);
    END IF;

    IF v_is_presenter AND v_attendance.status = 'absent' THEN
      INSERT INTO deposit_transactions (deposit_id, amount, reason, reference_type, reference_id)
      VALUES (v_deposit_id, v_amount_no_present, '발표 미수행', 'attendance', p_session_id);
      UPDATE deposits SET current_balance = current_balance + v_amount_no_present WHERE id = v_deposit_id;
      INSERT INTO fund_transactions (quarter_id, amount, category, description, date)
      VALUES (v_session.quarter_id, abs(v_amount_no_present), 'penalty', v_member.name || ' 발표 미수행 (' || v_session.session_number || '회차)', v_session.date);
      v_total_penalties := v_total_penalties + abs(v_amount_no_present);
    END IF;
  END LOOP;

  UPDATE attendances SET is_confirmed = true WHERE session_id = p_session_id;

  RETURN jsonb_build_object('total_penalties', v_total_penalties, 'session_id', p_session_id);
END;
$$;

-- ── 4) 옛 presenter_ids 컬럼 제거 ──
ALTER TABLE presentations DROP COLUMN IF EXISTS presenter_ids;

-- ── 5) 인덱스 ──
CREATE INDEX IF NOT EXISTS idx_presentations_presenter
  ON presentations(presenter_id) WHERE presenter_id IS NOT NULL;

-- ── 6) 분기당 1인 1발표 트리거 ──
CREATE OR REPLACE FUNCTION check_one_presentation_per_quarter()
RETURNS TRIGGER AS $$
DECLARE
  v_quarter_id UUID;
  v_count INTEGER;
BEGIN
  IF NEW.presenter_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- 시드/임포트용 우회 (서버 코드에서 SET LOCAL app.bypass_one_per_quarter = 'true' 설정 시)
  IF current_setting('app.bypass_one_per_quarter', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- UPDATE에서 presenter_id 가 그대로면 재검사 스킵 (멱등성)
  IF TG_OP = 'UPDATE' AND OLD.presenter_id IS NOT DISTINCT FROM NEW.presenter_id THEN
    RETURN NEW;
  END IF;

  SELECT quarter_id INTO v_quarter_id FROM sessions WHERE id = NEW.session_id;

  SELECT COUNT(*) INTO v_count
  FROM presentations p
  JOIN sessions s ON s.id = p.session_id
  WHERE p.presenter_id = NEW.presenter_id
    AND s.quarter_id = v_quarter_id
    AND p.id != NEW.id;

  IF v_count > 0 THEN
    RAISE EXCEPTION '분기당 1인 1회만 발표 가능합니다 (member %, quarter %)',
      NEW.presenter_id, v_quarter_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_one_presentation_per_quarter ON presentations;
CREATE TRIGGER trg_one_presentation_per_quarter
  BEFORE INSERT OR UPDATE OF presenter_id ON presentations
  FOR EACH ROW EXECUTE FUNCTION check_one_presentation_per_quarter();

-- ── 7) 예약 이력 테이블 ──
CREATE TABLE IF NOT EXISTS presentation_reservation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  presentation_id UUID REFERENCES presentations(id) ON DELETE CASCADE,
  member_id UUID REFERENCES members(id),
  action TEXT NOT NULL CHECK (action IN ('reserve', 'release', 'transfer_in', 'transfer_out', 'company_update')),
  previous_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reservation_logs_presentation
  ON presentation_reservation_logs(presentation_id);
CREATE INDEX IF NOT EXISTS idx_reservation_logs_member
  ON presentation_reservation_logs(member_id);
