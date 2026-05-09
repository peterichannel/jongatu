-- 즉시 페널티 적용 RPC + confirm_session_attendance 재정의
--
-- 변경 흐름:
--   기존: 자가 체크인 시 status 만 저장 → 운영자 "출결 확정" 버튼 → 그제서야 페널티 일괄 차감
--   변경: 자가 체크인 시 즉시 페널티 차감 → 운영자는 정정만 → "최종 확인" = 미체크 결석 처리 + 미응답/발표미수행 백필 + 잠금
--
-- apply_attendance_penalty(session_id, member_id):
--   - 단일 멤버의 attendances.status 기준 페널티 동기화 (idempotent)
--   - 호출 전 기존 페널티 행을 모두 reversal 한 뒤 새 status 기준으로 재적용
--   - 자가 체크인, 운영자 status 정정에서 호출
--   - is_test=true 회차는 가드 (트랜잭션 미생성)
--
-- confirm_session_attendance(session_id):
--   - "최종 확인" 단계
--   - 미체크 멤버 → status='absent' 행 생성 후 apply_attendance_penalty 호출
--   - 사전참석 미응답 멤버 → -3,000원 신규 적용 (idempotent)
--   - is_confirmed=true 잠금
--   - is_test=true → attendances만 잠금

-- ───────────────────────────────────────────────
-- apply_attendance_penalty
-- ───────────────────────────────────────────────
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
    -- normal 외(rest/dinner/social) 회차는 페널티 대상 아님
    RETURN jsonb_build_object('skipped', 'non_normal_session');
  END IF;

  SELECT * INTO v_member FROM members WHERE id = p_member_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '멤버를 찾을 수 없습니다';
  END IF;

  SELECT * INTO v_attendance FROM attendances
    WHERE session_id = p_session_id AND member_id = p_member_id;
  IF NOT FOUND THEN
    -- 체크 행이 없으면 페널티 처리 대상 아님 (finalize 시점에 absent 행 생성 후 재호출됨)
    RETURN jsonb_build_object('skipped', 'no_attendance_row');
  END IF;

  IF v_attendance.is_confirmed THEN
    RAISE EXCEPTION '이미 잠금된 회차입니다';
  END IF;

  -- is_test 회차는 페널티 트랜잭션 미생성
  IF v_session.is_test THEN
    RETURN jsonb_build_object('skipped', 'test_session');
  END IF;

  SELECT * INTO v_quarter FROM quarters WHERE id = v_session.quarter_id;

  -- deposits ensure
  SELECT id INTO v_deposit_id FROM deposits
    WHERE member_id = p_member_id AND quarter_id = v_session.quarter_id;
  IF v_deposit_id IS NULL THEN
    INSERT INTO deposits (member_id, quarter_id, initial_amount, current_balance)
    VALUES (p_member_id, v_session.quarter_id, v_quarter.default_deposit, v_quarter.default_deposit)
    RETURNING id INTO v_deposit_id;
  END IF;

  -- 기존 페널티 reversal: 보증금 측
  SELECT COALESCE(SUM(amount), 0) INTO v_old_dep_amount
  FROM deposit_transactions
  WHERE deposit_id = v_deposit_id
    AND reference_type = 'attendance'
    AND reference_id = p_session_id
    AND reason IN ('지각', '결석', '발표 미수행');

  IF v_old_dep_amount <> 0 THEN
    UPDATE deposits SET current_balance = current_balance - v_old_dep_amount WHERE id = v_deposit_id;
  END IF;

  DELETE FROM deposit_transactions
  WHERE deposit_id = v_deposit_id
    AND reference_type = 'attendance'
    AND reference_id = p_session_id
    AND reason IN ('지각', '결석', '발표 미수행');

  -- 기존 페널티 reversal: 운영비 측
  DELETE FROM fund_transactions
  WHERE reference_type = 'attendance'
    AND reference_id = p_session_id
    AND member_id = p_member_id
    AND category = 'penalty';

  -- 페널티 금액 조회
  SELECT amount INTO v_amount_late FROM penalty_rules WHERE rule_key = 'late' AND is_active = true;
  SELECT amount INTO v_amount_absent FROM penalty_rules WHERE rule_key = 'absent' AND is_active = true;
  SELECT amount INTO v_amount_no_present FROM penalty_rules WHERE rule_key = 'no_present' AND is_active = true;
  v_amount_late       := COALESCE(v_amount_late, -3000);
  v_amount_absent     := COALESCE(v_amount_absent, -10000);
  v_amount_no_present := COALESCE(v_amount_no_present, -30000);

  -- 발표자 여부
  SELECT EXISTS(
    SELECT 1 FROM presentations
    WHERE session_id = p_session_id AND presenter_id = p_member_id
  ) INTO v_is_presenter;

  -- 새 status 기준 페널티 적용
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
  -- 'present', 'excused' 는 페널티 없음 (위 reversal 만으로 종료)

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'member_id', p_member_id,
    'status', v_attendance.status,
    'applied', v_total_applied
  );
END;
$$;

-- ───────────────────────────────────────────────
-- confirm_session_attendance — "최종 확인"
-- ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION confirm_session_attendance(p_session_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_session sessions%ROWTYPE;
  v_quarter quarters%ROWTYPE;
  v_already_confirmed boolean;
  v_member RECORD;
  v_pre pre_attendances%ROWTYPE;
  v_attendance attendances%ROWTYPE;
  v_deposit_id uuid;
  v_amount_no_pre int;
  v_total_finalized int := 0;
  v_no_pre_existing_count int;
BEGIN
  SELECT * INTO v_session FROM sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '회차를 찾을 수 없습니다';
  END IF;
  IF v_session.type != 'normal' THEN
    RAISE EXCEPTION '정상 회차만 최종 확인할 수 있습니다';
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM attendances WHERE session_id = p_session_id AND is_confirmed = true
  ) INTO v_already_confirmed;
  IF v_already_confirmed THEN
    RAISE EXCEPTION '이미 최종 확인된 회차입니다';
  END IF;

  -- is_test 회차는 attendances 잠금만 (페널티 미생성)
  IF v_session.is_test THEN
    UPDATE attendances SET is_confirmed = true WHERE session_id = p_session_id;
    RETURN jsonb_build_object(
      'session_id', p_session_id,
      'is_test', true,
      'finalized_amount', 0
    );
  END IF;

  SELECT * INTO v_quarter FROM quarters WHERE id = v_session.quarter_id;

  SELECT amount INTO v_amount_no_pre FROM penalty_rules
    WHERE rule_key = 'no_pre_attendance' AND is_active = true;
  v_amount_no_pre := COALESCE(v_amount_no_pre, -3000);

  -- 활성 멤버 순회
  FOR v_member IN SELECT * FROM members WHERE is_active = true LOOP
    -- 1. 미체크 → 자동 결석 처리
    SELECT * INTO v_attendance FROM attendances
      WHERE session_id = p_session_id AND member_id = v_member.id;
    IF NOT FOUND THEN
      INSERT INTO attendances (session_id, member_id, status, is_confirmed)
      VALUES (p_session_id, v_member.id, 'absent', false);
      -- apply_attendance_penalty 호출 → -10,000 (+ 발표자면 -30,000)
      PERFORM apply_attendance_penalty(p_session_id, v_member.id);
      v_total_finalized := v_total_finalized + 1;
    END IF;

    -- 2. 사전참석 미응답 페널티 (idempotent: 이미 들어가 있으면 skip)
    SELECT id INTO v_deposit_id FROM deposits
      WHERE member_id = v_member.id AND quarter_id = v_session.quarter_id;
    IF v_deposit_id IS NULL THEN
      INSERT INTO deposits (member_id, quarter_id, initial_amount, current_balance)
      VALUES (v_member.id, v_session.quarter_id, v_quarter.default_deposit, v_quarter.default_deposit)
      RETURNING id INTO v_deposit_id;
    END IF;

    SELECT * INTO v_pre FROM pre_attendances
      WHERE session_id = p_session_id AND member_id = v_member.id;
    IF NOT FOUND THEN
      SELECT count(*) INTO v_no_pre_existing_count FROM deposit_transactions
      WHERE deposit_id = v_deposit_id
        AND reference_type = 'attendance'
        AND reference_id = p_session_id
        AND reason = '사전참석확인 미등록';
      IF v_no_pre_existing_count = 0 THEN
        INSERT INTO deposit_transactions (deposit_id, amount, reason, reference_type, reference_id)
        VALUES (v_deposit_id, v_amount_no_pre, '사전참석확인 미등록', 'attendance', p_session_id);
        UPDATE deposits SET current_balance = current_balance + v_amount_no_pre WHERE id = v_deposit_id;
        INSERT INTO fund_transactions (quarter_id, amount, category, description, date, reference_type, reference_id, member_id)
        VALUES (v_session.quarter_id, abs(v_amount_no_pre), 'penalty',
                v_member.name || ' 사전참석 미응답 (' || v_session.session_number || '회차)',
                v_session.date, 'attendance', p_session_id, v_member.id);
      END IF;
    END IF;
  END LOOP;

  -- 3. 잠금
  UPDATE attendances SET is_confirmed = true WHERE session_id = p_session_id;

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'finalized_count', v_total_finalized
  );
END;
$$;
