-- 26년 상반기 (Q1 + Q2 일부) 출결 백필 시드
--
-- 형님(이상호) 정리 매트릭스 기반:
--   - 17명 활성 멤버 × 8회차 (Q1: 1/14, 1/28, 2/11, 2/25, 3/11, 3/25 / Q2: 4/8, 5/6)
--   - 운영자 대리체크는 'present' 처리 (운영 정책)
--   - 잘못 등록된 회차 #7 (Q1 / 4/8) 정리: attendance/pre/페널티/보증금 reversal + 세션 삭제
--   - 사전참석 미응답 페널티는 26년 상반기 한정 면제: 모든 멤버×회차 'attending' 시드로 자동 0
--
-- 페널티 합계 검증 (apply_attendance_penalty 호출 후 기대값):
--   결석 -10,000 × 35회 = -350,000
--   지각 -3,000  × 9회   =  -27,000
--   합계: -377,000원 (운영비 자동 입금)

BEGIN;

-- ───────────────────────────────────────────────
-- Phase 1: 잘못 등록된 회차 #7 (Q1 / 4/8) 정리
-- ───────────────────────────────────────────────
DO $$
DECLARE
  bad_session_id uuid;
  v_dep record;
BEGIN
  SELECT s.id INTO bad_session_id
  FROM sessions s
  JOIN quarters q ON q.id = s.quarter_id
  WHERE s.session_number = 7 AND s.date = '2026-04-08' AND q.name = '2026-Q1';

  IF bad_session_id IS NOT NULL THEN
    FOR v_dep IN
      SELECT deposit_id, SUM(amount) AS total
      FROM deposit_transactions
      WHERE reference_type = 'attendance' AND reference_id = bad_session_id
      GROUP BY deposit_id
    LOOP
      UPDATE deposits SET current_balance = current_balance - v_dep.total
        WHERE id = v_dep.deposit_id;
    END LOOP;

    DELETE FROM deposit_transactions WHERE reference_type='attendance' AND reference_id = bad_session_id;
    DELETE FROM fund_transactions    WHERE reference_type='attendance' AND reference_id = bad_session_id;
    DELETE FROM attendances          WHERE session_id = bad_session_id;
    DELETE FROM pre_attendances      WHERE session_id = bad_session_id;
    DELETE FROM sessions             WHERE id = bad_session_id;
  END IF;
END $$;

-- ───────────────────────────────────────────────
-- Phase 2: 26-Q1 회차 6개 신규 등록
-- ───────────────────────────────────────────────
INSERT INTO sessions (quarter_id, session_number, date, type, is_test)
SELECT q.id, sn, sd, 'normal', false
FROM quarters q,
     (VALUES (1, DATE '2026-01-14'), (2, DATE '2026-01-28'),
             (3, DATE '2026-02-11'), (4, DATE '2026-02-25'),
             (5, DATE '2026-03-11'), (6, DATE '2026-03-25')) AS v(sn, sd)
WHERE q.name = '2026-Q1'
ON CONFLICT DO NOTHING;

-- ───────────────────────────────────────────────
-- Phase 3: 사전참석 'attending' 일괄 시드 (26년 상반기 미응답 페널티 면제)
-- ───────────────────────────────────────────────
INSERT INTO pre_attendances (session_id, member_id, status, responded_at)
SELECT s.id, m.id, 'attending',
       (s.date::text || ' 12:00:00+09:00')::timestamptz
FROM sessions s
CROSS JOIN members m
WHERE s.type='normal' AND s.is_test=false
  AND s.date >= '2026-01-01' AND s.date <= '2026-05-06'
  AND m.is_active = true
ON CONFLICT (session_id, member_id) DO NOTHING;

-- ───────────────────────────────────────────────
-- Phase 4: attendances 17명 × 8회차 매트릭스 백필
-- ───────────────────────────────────────────────
WITH att_data (member_name, sess_date, status) AS (VALUES
  -- 운영자 (3명)
  ('이상호', DATE '2026-01-14', 'absent'),
  ('이상호', DATE '2026-01-28', 'present'),
  ('이상호', DATE '2026-02-11', 'late'),
  ('이상호', DATE '2026-02-25', 'absent'),
  ('이상호', DATE '2026-03-11', 'late'),
  ('이상호', DATE '2026-03-25', 'present'),
  ('이상호', DATE '2026-04-08', 'late'),
  ('이상호', DATE '2026-05-06', 'present'),

  ('양민기', DATE '2026-01-14', 'present'),
  ('양민기', DATE '2026-01-28', 'present'),
  ('양민기', DATE '2026-02-11', 'present'),
  ('양민기', DATE '2026-02-25', 'absent'),
  ('양민기', DATE '2026-03-11', 'absent'),
  ('양민기', DATE '2026-03-25', 'present'),
  ('양민기', DATE '2026-04-08', 'absent'),
  ('양민기', DATE '2026-05-06', 'present'),

  ('이우재', DATE '2026-01-14', 'absent'),
  ('이우재', DATE '2026-01-28', 'present'),
  ('이우재', DATE '2026-02-11', 'present'),
  ('이우재', DATE '2026-02-25', 'present'),
  ('이우재', DATE '2026-03-11', 'present'),
  ('이우재', DATE '2026-03-25', 'absent'),
  ('이우재', DATE '2026-04-08', 'absent'),
  ('이우재', DATE '2026-05-06', 'present'),

  -- 만점 멤버 (3명)
  ('김동주', DATE '2026-01-14', 'present'),
  ('김동주', DATE '2026-01-28', 'present'),
  ('김동주', DATE '2026-02-11', 'present'),
  ('김동주', DATE '2026-02-25', 'present'),
  ('김동주', DATE '2026-03-11', 'present'),
  ('김동주', DATE '2026-03-25', 'present'),
  ('김동주', DATE '2026-04-08', 'present'),
  ('김동주', DATE '2026-05-06', 'present'),

  ('김영호', DATE '2026-01-14', 'present'),
  ('김영호', DATE '2026-01-28', 'present'),
  ('김영호', DATE '2026-02-11', 'present'),
  ('김영호', DATE '2026-02-25', 'present'),
  ('김영호', DATE '2026-03-11', 'present'),
  ('김영호', DATE '2026-03-25', 'present'),
  ('김영호', DATE '2026-04-08', 'present'),
  ('김영호', DATE '2026-05-06', 'present'),

  ('박성철', DATE '2026-01-14', 'present'),
  ('박성철', DATE '2026-01-28', 'present'),
  ('박성철', DATE '2026-02-11', 'present'),
  ('박성철', DATE '2026-02-25', 'present'),
  ('박성철', DATE '2026-03-11', 'present'),
  ('박성철', DATE '2026-03-25', 'present'),
  ('박성철', DATE '2026-04-08', 'present'),
  ('박성철', DATE '2026-05-06', 'present'),

  -- 일반 멤버 (페널티 적은 순)
  ('서유나', DATE '2026-01-14', 'present'),
  ('서유나', DATE '2026-01-28', 'present'),
  ('서유나', DATE '2026-02-11', 'present'),
  ('서유나', DATE '2026-02-25', 'present'),
  ('서유나', DATE '2026-03-11', 'absent'),
  ('서유나', DATE '2026-03-25', 'present'),
  ('서유나', DATE '2026-04-08', 'present'),
  ('서유나', DATE '2026-05-06', 'present'),

  ('서수민', DATE '2026-01-14', 'absent'),
  ('서수민', DATE '2026-01-28', 'present'),
  ('서수민', DATE '2026-02-11', 'present'),
  ('서수민', DATE '2026-02-25', 'present'),
  ('서수민', DATE '2026-03-11', 'absent'),
  ('서수민', DATE '2026-03-25', 'present'),
  ('서수민', DATE '2026-04-08', 'present'),
  ('서수민', DATE '2026-05-06', 'present'),

  ('이신우', DATE '2026-01-14', 'present'),
  ('이신우', DATE '2026-01-28', 'absent'),
  ('이신우', DATE '2026-02-11', 'present'),
  ('이신우', DATE '2026-02-25', 'present'),
  ('이신우', DATE '2026-03-11', 'present'),
  ('이신우', DATE '2026-03-25', 'absent'),
  ('이신우', DATE '2026-04-08', 'present'),
  ('이신우', DATE '2026-05-06', 'present'),

  ('이애리', DATE '2026-01-14', 'present'),
  ('이애리', DATE '2026-01-28', 'present'),
  ('이애리', DATE '2026-02-11', 'present'),
  ('이애리', DATE '2026-02-25', 'present'),
  ('이애리', DATE '2026-03-11', 'present'),
  ('이애리', DATE '2026-03-25', 'present'),
  ('이애리', DATE '2026-04-08', 'absent'),
  ('이애리', DATE '2026-05-06', 'absent'),

  ('임지향', DATE '2026-01-14', 'present'),
  ('임지향', DATE '2026-01-28', 'present'),
  ('임지향', DATE '2026-02-11', 'present'),
  ('임지향', DATE '2026-02-25', 'present'),
  ('임지향', DATE '2026-03-11', 'absent'),
  ('임지향', DATE '2026-03-25', 'present'),
  ('임지향', DATE '2026-04-08', 'present'),
  ('임지향', DATE '2026-05-06', 'absent'),

  ('김윤정', DATE '2026-01-14', 'present'),
  ('김윤정', DATE '2026-01-28', 'present'),
  ('김윤정', DATE '2026-02-11', 'present'),
  ('김윤정', DATE '2026-02-25', 'late'),
  ('김윤정', DATE '2026-03-11', 'late'),
  ('김윤정', DATE '2026-03-25', 'absent'),
  ('김윤정', DATE '2026-04-08', 'late'),
  ('김윤정', DATE '2026-05-06', 'absent'),

  ('박경환', DATE '2026-01-14', 'present'),
  ('박경환', DATE '2026-01-28', 'present'),
  ('박경환', DATE '2026-02-11', 'absent'),
  ('박경환', DATE '2026-02-25', 'present'),
  ('박경환', DATE '2026-03-11', 'absent'),
  ('박경환', DATE '2026-03-25', 'present'),
  ('박경환', DATE '2026-04-08', 'absent'),
  ('박경환', DATE '2026-05-06', 'present'),

  ('강성민', DATE '2026-01-14', 'present'),
  ('강성민', DATE '2026-01-28', 'absent'),
  ('강성민', DATE '2026-02-11', 'present'),
  ('강성민', DATE '2026-02-25', 'absent'),
  ('강성민', DATE '2026-03-11', 'present'),
  ('강성민', DATE '2026-03-25', 'absent'),
  ('강성민', DATE '2026-04-08', 'present'),
  ('강성민', DATE '2026-05-06', 'present'),

  ('유병우', DATE '2026-01-14', 'present'),
  ('유병우', DATE '2026-01-28', 'present'),
  ('유병우', DATE '2026-02-11', 'absent'),
  ('유병우', DATE '2026-02-25', 'present'),
  ('유병우', DATE '2026-03-11', 'present'),
  ('유병우', DATE '2026-03-25', 'absent'),
  ('유병우', DATE '2026-04-08', 'late'),
  ('유병우', DATE '2026-05-06', 'absent'),

  ('이종명', DATE '2026-01-14', 'absent'),
  ('이종명', DATE '2026-01-28', 'present'),
  ('이종명', DATE '2026-02-11', 'absent'),
  ('이종명', DATE '2026-02-25', 'late'),
  ('이종명', DATE '2026-03-11', 'present'),
  ('이종명', DATE '2026-03-25', 'present'),
  ('이종명', DATE '2026-04-08', 'present'),
  ('이종명', DATE '2026-05-06', 'absent'),

  ('최수진', DATE '2026-01-14', 'absent'),
  ('최수진', DATE '2026-01-28', 'present'),
  ('최수진', DATE '2026-02-11', 'absent'),
  ('최수진', DATE '2026-02-25', 'late'),
  ('최수진', DATE '2026-03-11', 'present'),
  ('최수진', DATE '2026-03-25', 'absent'),
  ('최수진', DATE '2026-04-08', 'absent'),
  ('최수진', DATE '2026-05-06', 'present')
)
INSERT INTO attendances (session_id, member_id, status, checked_in_at)
SELECT s.id, m.id, ad.status::text,
       CASE WHEN ad.status IN ('present','late')
            THEN (ad.sess_date::text || ' 19:00:00+09:00')::timestamptz
            ELSE NULL
       END
FROM att_data ad
JOIN members m ON m.name = ad.member_name AND m.is_active = true
JOIN sessions s ON s.date = ad.sess_date AND s.type='normal' AND s.is_test=false
ON CONFLICT (session_id, member_id) DO UPDATE
  SET status = EXCLUDED.status,
      checked_in_at = EXCLUDED.checked_in_at;

-- ───────────────────────────────────────────────
-- Phase 5: apply_attendance_penalty 일괄 호출 (모든 활성 멤버 × 26년 상반기 정상 회차)
--   - pre_attendances 'attending' 시드된 상태이므로 사전 미응답 페널티 0
--   - 지각 -3,000 + 결석 -10,000만 적용
-- ───────────────────────────────────────────────
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT s.id AS sid, m.id AS mid
    FROM sessions s
    CROSS JOIN members m
    WHERE s.type='normal' AND s.is_test=false
      AND s.date >= '2026-01-01' AND s.date <= '2026-05-06'
      AND m.is_active = true
  LOOP
    PERFORM apply_attendance_penalty(r.sid, r.mid);
  END LOOP;
END $$;

COMMIT;
