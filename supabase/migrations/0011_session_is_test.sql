-- 테스트 회차 인프라
-- 1) sessions.is_test 컬럼 추가 (기존 회차 모두 false)
-- 2) confirm_session_attendance 함수에 페널티 가드 추가
--    is_test = true 회차는 attendances 확정만 하고 페널티 트랜잭션은 생성하지 않음
--    (운영진끼리 자가 체크인/페널티 흐름을 검증할 때 진짜 보증금에 영향 주지 않게)

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;

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

  -- 테스트 회차는 페널티 트랜잭션 없이 attendances 확정만 처리
  IF v_session.is_test THEN
    UPDATE attendances SET is_confirmed = true WHERE session_id = p_session_id;
    RETURN jsonb_build_object(
      'total_penalties', 0,
      'session_id', p_session_id,
      'is_test', true
    );
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
