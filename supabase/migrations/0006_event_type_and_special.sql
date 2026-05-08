-- 회차 type 'event' 추가 (휴식/회식/송년회 등 비발표 회차)
-- 발표 슬롯 special_label (포트폴리오 발표 등 그룹 활동)
-- presenter_ids NULL 허용 (special 슬롯)

ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_type_check;
ALTER TABLE sessions ADD CONSTRAINT sessions_type_check
  CHECK (type IN ('normal', 'rest', 'dinner', 'social', 'event'));

ALTER TABLE presentations ALTER COLUMN presenter_ids DROP NOT NULL;
ALTER TABLE presentations ADD COLUMN IF NOT EXISTS special_label TEXT;
