-- 슬롯 예약 RPC 함수 3종
-- 동시성: SELECT ... FOR UPDATE 로 행 락
-- 분기당 1인 1발표는 0008 의 트리거가 강제하므로 본 함수에서는 이동 시 기존 슬롯 NULL 처리만 수행

-- ── reserve_presentation_slot ──
-- 빈 슬롯 점유, 본인이 같은 분기에 이미 예약했다면 자동 이동
CREATE OR REPLACE FUNCTION reserve_presentation_slot(
  p_member_id UUID,
  p_presentation_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_quarter_id UUID;
  v_existing_id UUID;
  v_existing_company TEXT;
  v_slot_owner UUID;
  v_session_type TEXT;
BEGIN
  -- 대상 슬롯 락 + 회차 정보
  SELECT p.presenter_id, s.quarter_id, s.type
  INTO v_slot_owner, v_quarter_id, v_session_type
  FROM presentations p
  JOIN sessions s ON s.id = p.session_id
  WHERE p.id = p_presentation_id
  FOR UPDATE OF p;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', '슬롯을 찾을 수 없습니다');
  END IF;

  IF v_session_type = 'event' THEN
    RETURN json_build_object('success', false, 'error', 'event 회차는 예약 대상이 아닙니다');
  END IF;

  IF v_slot_owner IS NOT NULL THEN
    IF v_slot_owner = p_member_id THEN
      RETURN json_build_object('success', false, 'error', '이미 본인이 예약한 슬롯입니다');
    END IF;
    RETURN json_build_object('success', false, 'error', '이미 다른 분이 예약하셨습니다');
  END IF;

  -- 같은 분기 내 본인 기존 예약 찾기 (이동 처리)
  SELECT p.id, p.company_name INTO v_existing_id, v_existing_company
  FROM presentations p
  JOIN sessions s ON s.id = p.session_id
  WHERE p.presenter_id = p_member_id
    AND s.quarter_id = v_quarter_id
    AND p.id != p_presentation_id
  FOR UPDATE OF p
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE presentations
    SET presenter_id = NULL,
        company_name = NULL,
        reserved_at = NULL,
        company_updated_at = NULL
    WHERE id = v_existing_id;

    INSERT INTO presentation_reservation_logs(presentation_id, member_id, action, previous_value, new_value)
    VALUES (v_existing_id, p_member_id, 'transfer_out', v_existing_company, NULL);
  END IF;

  -- 새 슬롯 점유
  UPDATE presentations
  SET presenter_id = p_member_id,
      reserved_at = NOW()
  WHERE id = p_presentation_id;

  INSERT INTO presentation_reservation_logs(presentation_id, member_id, action)
  VALUES (
    p_presentation_id,
    p_member_id,
    CASE WHEN v_existing_id IS NOT NULL THEN 'transfer_in' ELSE 'reserve' END
  );

  RETURN json_build_object(
    'success', true,
    'transferred', v_existing_id IS NOT NULL,
    'transferred_from', v_existing_id
  );
END;
$$ LANGUAGE plpgsql;


-- ── cancel_presentation_slot ──
-- 본인 슬롯만 취소 가능
CREATE OR REPLACE FUNCTION cancel_presentation_slot(
  p_member_id UUID,
  p_presentation_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_owner UUID;
  v_company TEXT;
BEGIN
  SELECT presenter_id, company_name INTO v_owner, v_company
  FROM presentations
  WHERE id = p_presentation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', '슬롯을 찾을 수 없습니다');
  END IF;

  IF v_owner IS NULL THEN
    RETURN json_build_object('success', false, 'error', '예약되지 않은 슬롯입니다');
  END IF;

  IF v_owner != p_member_id THEN
    RETURN json_build_object('success', false, 'error', '본인 예약만 취소 가능합니다');
  END IF;

  UPDATE presentations
  SET presenter_id = NULL,
      company_name = NULL,
      reserved_at = NULL,
      company_updated_at = NULL
  WHERE id = p_presentation_id;

  INSERT INTO presentation_reservation_logs(presentation_id, member_id, action, previous_value)
  VALUES (p_presentation_id, p_member_id, 'release', v_company);

  RETURN json_build_object('success', true);
END;
$$ LANGUAGE plpgsql;


-- ── update_presentation_company ──
-- 본인 슬롯의 종목명 입력/수정
CREATE OR REPLACE FUNCTION update_presentation_company(
  p_member_id UUID,
  p_presentation_id UUID,
  p_company_name TEXT
)
RETURNS JSON AS $$
DECLARE
  v_owner UUID;
  v_old_company TEXT;
  v_clean TEXT;
BEGIN
  SELECT presenter_id, company_name INTO v_owner, v_old_company
  FROM presentations
  WHERE id = p_presentation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', '슬롯을 찾을 수 없습니다');
  END IF;

  IF v_owner IS NULL OR v_owner != p_member_id THEN
    RETURN json_build_object('success', false, 'error', '본인 슬롯만 수정 가능합니다');
  END IF;

  v_clean := NULLIF(BTRIM(p_company_name), '');

  UPDATE presentations
  SET company_name = v_clean,
      company_updated_at = NOW()
  WHERE id = p_presentation_id;

  INSERT INTO presentation_reservation_logs(presentation_id, member_id, action, previous_value, new_value)
  VALUES (p_presentation_id, p_member_id, 'company_update', v_old_company, v_clean);

  RETURN json_build_object('success', true, 'company_name', v_clean);
END;
$$ LANGUAGE plpgsql;
