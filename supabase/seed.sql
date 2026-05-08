-- 페널티 규칙
INSERT INTO penalty_rules (rule_key, rule_name, amount) VALUES
  ('no_pre_attendance', '사전참석확인 미등록', -3000),
  ('late', '지각 (7시 20분 이후)', -3000),
  ('absent', '결석', -10000),
  ('no_present', '발표 미수행', -30000)
ON CONFLICT (rule_key) DO NOTHING;

-- 현재 분기 (26-2)
INSERT INTO quarters (name, start_date, end_date, default_deposit, is_active) VALUES
  ('26-2', '2026-04-01', '2026-06-30', 45000, true)
ON CONFLICT (name) DO NOTHING;

-- 19명 placeholder 멤버 (운영자가 /admin/members 에서 실제 이름으로 수정)
INSERT INTO members (name) VALUES
  ('스터디원01'),('스터디원02'),('스터디원03'),('스터디원04'),('스터디원05'),
  ('스터디원06'),('스터디원07'),('스터디원08'),('스터디원09'),('스터디원10'),
  ('스터디원11'),('스터디원12'),('스터디원13'),('스터디원14'),('스터디원15'),
  ('스터디원16'),('스터디원17'),('스터디원18'),('스터디원19')
ON CONFLICT DO NOTHING;
