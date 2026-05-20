-- 페널티 규칙
-- no_pre_attendance 는 카페 공지와 달리 실제 차감을 하지 않음 (운영진 정책) → is_active=false
INSERT INTO penalty_rules (rule_key, rule_name, amount, is_active) VALUES
  ('no_pre_attendance', '사전참석확인 미등록', -3000, false),
  ('late',              '지각 (7시 20분 이후)', -3000, true),
  ('absent',            '결석',                  -10000, true),
  ('no_present',        '발표 미수행',           -30000, true)
ON CONFLICT (rule_key) DO NOTHING;

-- 현재 분기 (26-2) — 발표 일정·회차 관리용
INSERT INTO quarters (name, start_date, end_date, default_deposit, is_active) VALUES
  ('26-2', '2026-04-01', '2026-06-30', 45000, true)
ON CONFLICT (name) DO NOTHING;

-- 현재 반기 (2026-H1) — 보증금·운영비 관리용
INSERT INTO halves (name, start_date, end_date, default_deposit, default_operating_fee, is_active) VALUES
  ('2026-H1', '2026-01-01', '2026-06-30', 45000, 45000, true),
  ('2026-H2', '2026-07-01', '2026-12-31', 45000, 45000, false)
ON CONFLICT (name) DO NOTHING;

-- 19명 placeholder 멤버 (운영자가 /admin/members 에서 실제 이름으로 수정)
INSERT INTO members (name) VALUES
  ('스터디원01'),('스터디원02'),('스터디원03'),('스터디원04'),('스터디원05'),
  ('스터디원06'),('스터디원07'),('스터디원08'),('스터디원09'),('스터디원10'),
  ('스터디원11'),('스터디원12'),('스터디원13'),('스터디원14'),('스터디원15'),
  ('스터디원16'),('스터디원17'),('스터디원18'),('스터디원19')
ON CONFLICT DO NOTHING;
