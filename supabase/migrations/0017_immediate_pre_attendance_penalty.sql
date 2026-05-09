-- 사전참석 미응답 페널티도 apply_attendance_penalty 안에서 즉시 처리
--
-- 0015에서 도입된 apply_attendance_penalty 는 attendance.status (지각/결석/공결/출석)만 동기화했고,
-- 사전참석 미응답 -3,000원은 폐기된 confirm_session_attendance 에서 일괄 처리됐다.
-- 이제 "그때그때 즉시 차감" 정책에 따라 같은 함수가 두 종류 페널티를 모두 동기화한다.
--
-- 트리거 시점:
--   - 자가 체크인 (app/api/attendance/check-in)
--   - 운영자 status 정정 (app/api/admin/attendances)
--   - 사전참석 응답 (app/api/pre-attendance) — 응답 시점에 reversal 만이라도 일관성 확보
--
-- 함수 동작:
--   1. attendances 행 + pre_attendances 행 둘 다 조회 (없어도 진행)
--   2. 기존 페널티 행 전체 reversal (지각/결석/발표 미수행/사전참석확인 미등록)
--   3. attendances 행이 있으면 status 기준 attendance 페널티 재적용
--   4. pre_attendances 행이 없으면 사전참석 미응답 페널티 재적용
--   5. is_confirmed 잠금 체크는 제거 (잠금 개념 자체 폐기)
--
-- 정상(normal) 회차만 대상, is_test 회차는 가드.

CREATE OR REPLACE FUNCTION apply_attendance_penalty(
  p_session_id UUID,
  p_member_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_session sessions%ROWTYPE;
  v_quarter quarters%ROWTYPE;
  v_member members%ROWTYPE;
  v_attendance attendances%ROWTYPE;
  v_attendance_found boolean;
  v_pre_found boolean;
  v_is_presenter boolean;
  v_deposit_id uuid;
  v_old_dep_amount int;

  v_amount_late int;
  v_amount_absent int;
  v_amount_no_present int;
  v_amount_no_pre int;
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

  SELECT * INTO v_quarter FROM quarters WHERE id = v_session.quarter_id;

  SELECT * INTO v_attendance FROM attendances
    WHERE session_id = p_session_id AND member_id = p_member_id;
  v_attendance_found := FOUND;

  SELECT 1 INTO v_pre_found FROM pre_attendances
    WHERE session_id = p_session_id AND member_id = p_member_id;
  v_pre_found := FOUND;

  -- deposits ensure
  SELECT id INTO v_deposit_id FROM deposits
    WHERE member_id = p_member_id AND quarter_id = v_session.quarter_id;
  IF v_deposit_id IS NULL THEN
    INSERT INTO deposits (member_id, quarter_id, initial_amount, current_balance)
    VALUES (p_member_id, v_session.quarter_id, v_quarter.default_deposit, v_quarter.default_deposit)
    RETURNING id INTO v_deposit_id;
  END IF;

  -- 페널티 금액 조회
  SELECT amount INTO v_amount_late FROM penalty_rules WHERE rule_key = 'late' AND is_active = true;
  SELECT amount INTO v_amount_absent FROM penalty_rules WHERE rule_key = 'absent' AND is_active = true;
  SELECT amount INTO v_amount_no_present FROM penalty_rules WHERE rule_key = 'no_present' AND is_active = true;
  SELECT amount INTO v_amount_no_pre FROM penalty_rules WHERE rule_key = 'no_pre_attendance' AND is_active = true;
  v_amount_late       := COALESCE(v_amount_late, -3000);
  v_amount_absent     := COALESCE(v_amount_absent, -10000);
  v_amount_no_present := COALESCE(v_amount_no_present, -30000);
  v_amount_no_pre     := COALESCE(v_amount_no_pre, -3000);

  -- ───────────────────────────────────────────────
  -- 기존 페널티 reversal (attendance + pre-attendance 통합)
  -- ───────────────────────────────────────────────
  SELECT COALESCE(SUM(amount), 0) INTO v_old_dep_amount
  FROM deposit_transactions
  WHERE deposit_id = v_deposit_id
    AND reference_type = 'attendance'
    AND reference_id = p_session_id
    AND reason IN ('지각', '결석', '발표 미수행', '사전참석확인 미등록');

  IF v_old_dep_amount <> 0 THEN
    UPDATE deposits SET current_balance = current_balance - v_old_dep_amount WHERE id = v_deposit_id;
  END IF;

  DELETE FROM deposit_transactions
  WHERE deposit_id = v_deposit_id
    AND reference_type = 'attendance'
    AND reference_id = p_session_id
    AND reason IN ('지각', '결석', '발표 미수행', '사전참석확인 미등록');

  DELETE FROM fund_transactions
  WHERE reference_type = 'attendance'
    AND reference_id = p_session_id
    AND member_id = p_member_id
    AND category = 'penalty';

  -- ───────────────────────────────────────────────
  -- attendance 페널티 (attendance 행이 있을 때만)
  -- ───────────────────────────────────────────────
  IF v_attendance_found THEN
    SELECT EXISTS(
      SELECT 1 FROM presentations
      WHERE session_id = p_session_id AND presenter_id = p_member_id
    ) INTO v_is_presenter;

    IF v_attendance.status = 'late' THEN
      INSERT INTO deposit_transactions (deposit_id, amount, reason, reference_type, reference_id)
      VALUES (v_deposit_id, v_amount_late, '지각', 'attendance', p_session_id);
      UPDATE deposits SET current_balance = current_balance + v_amount_late WHERE id = v_deposit_id;
      INSERT INTO fund_transactions (quarter_id, amount, category, description, date, reference_type, reference_id, member_id)
      VALUES (v_session.quarter_id, abs(v_amount_late), 'penalty',
              v_member.name || ' 지각 (' || v_session.session_number || '회차)',
              v_session.date, 'attendance', p_session_id, p_member_id);
      v_total_applied := v_total_applied + abs(v_amount_late);
    ELSIF v_attendance.status = 'absent' THEN
      INSERT INTO deposit_transactions (deposit_id, amount, reason, reference_type, reference_id)
      VALUES (v_deposit_id, v_amount_absent, '결석', 'attendance', p_session_id);
      UPDATE deposits SET current_balance = current_balance + v_amount_absent WHERE id = v_deposit_id;
      INSERT INTO fund_transactions (quarter_id, amount, category, description, date, reference_type, reference_id, member_id)
      VALUES (v_session.quarter_id, abs(v_amount_absent), 'penalty',
              v_member.name || ' 결석 (' || v_session.session_number || '회차)',
              v_session.date, 'attendance', p_session_id, p_member_id);
      v_total_applied := v_total_applied + abs(v_amount_absent);

      IF v_is_presenter THEN
        INSERT INTO deposit_transactions (deposit_id, amount, reason, reference_type, reference_id)
        VALUES (v_deposit_id, v_amount_no_present, '발표 미수행', 'attendance', p_session_id);
        UPDATE deposits SET current_balance = current_balance + v_amount_no_present WHERE id = v_deposit_id;
        INSERT INTO fund_transactions (quarter_id, amount, category, description, date, reference_type, reference_id, member_id)
        VALUES (v_session.quarter_id, abs(v_amount_no_present), 'penalty',
                v_member.name || ' 발표 미수행 (' || v_session.session_number || '회차)',
                v_session.date, 'attendance', p_session_id, p_member_id);
        v_total_applied := v_total_applied + abs(v_amount_no_present);
      END IF;
    END IF;
    -- 'present', 'excused' 는 attendance 페널티 없음
  END IF;

  -- ───────────────────────────────────────────────
  -- 사전참석 미응답 페널티 (pre_attendances 행이 없으면)
  -- ───────────────────────────────────────────────
  IF NOT v_pre_found THEN
    INSERT INTO deposit_transactions (deposit_id, amount, reason, reference_type, reference_id)
    VALUES (v_deposit_id, v_amount_no_pre, '사전참석확인 미등록', 'attendance', p_session_id);
    UPDATE deposits SET current_balance = current_balance + v_amount_no_pre WHERE id = v_deposit_id;
    INSERT INTO fund_transactions (quarter_id, amount, category, description, date, reference_type, reference_id, member_id)
    VALUES (v_session.quarter_id, abs(v_amount_no_pre), 'penalty',
            v_member.name || ' 사전참석 미응답 (' || v_session.session_number || '회차)',
            v_session.date, 'attendance', p_session_id, p_member_id);
    v_total_applied := v_total_applied + abs(v_amount_no_pre);
  END IF;

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'member_id', p_member_id,
    'attendance_status', v_attendance.status,
    'pre_responded', v_pre_found,
    'applied', v_total_applied
  );
END;
$$;
