-- 지난 회차(s.date < 오늘 KST) 슬롯에는 예약/취소/종목변경 모두 거부한다.
-- 클라이언트가 버튼을 숨기는 것과 별개로 RPC 단에서 동일 가드를 둔다 (방어 1단계).

-- ── reserve_presentation_slot ──
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
  v_session_date DATE;
  v_today DATE := (now() AT TIME ZONE 'Asia/Seoul')::date;
BEGIN
  SELECT p.presenter_id, s.quarter_id, s.type, s.date
  INTO v_slot_owner, v_quarter_id, v_session_type, v_session_date
  FROM presentations p
  JOIN sessions s ON s.id = p.session_id
  WHERE p.id = p_presentation_id
  FOR UPDATE OF p;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', '슬롯을 찾을 수 없습니다');
  END IF;

  IF v_session_date < v_today THEN
    RETURN json_build_object('success', false, 'error', '이미 종료된 회차는 예약할 수 없습니다');
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
CREATE OR REPLACE FUNCTION cancel_presentation_slot(
  p_member_id UUID,
  p_presentation_id UUID
)
RETURNS JSON AS $$
DECLARE
  v_owner UUID;
  v_company TEXT;
  v_session_date DATE;
  v_today DATE := (now() AT TIME ZONE 'Asia/Seoul')::date;
BEGIN
  SELECT p.presenter_id, p.company_name, s.date
  INTO v_owner, v_company, v_session_date
  FROM presentations p
  JOIN sessions s ON s.id = p.session_id
  WHERE p.id = p_presentation_id
  FOR UPDATE OF p;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', '슬롯을 찾을 수 없습니다');
  END IF;

  IF v_session_date < v_today THEN
    RETURN json_build_object('success', false, 'error', '이미 종료된 회차는 취소할 수 없습니다');
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
  v_session_date DATE;
  v_today DATE := (now() AT TIME ZONE 'Asia/Seoul')::date;
BEGIN
  SELECT p.presenter_id, p.company_name, s.date
  INTO v_owner, v_old_company, v_session_date
  FROM presentations p
  JOIN sessions s ON s.id = p.session_id
  WHERE p.id = p_presentation_id
  FOR UPDATE OF p;

  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', '슬롯을 찾을 수 없습니다');
  END IF;

  IF v_session_date < v_today THEN
    RETURN json_build_object('success', false, 'error', '이미 종료된 회차는 수정할 수 없습니다');
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
