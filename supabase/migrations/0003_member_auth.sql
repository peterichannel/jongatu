-- 멤버 셀프 PIN 인증
-- 멤버가 첫 진입 시 PIN 4자리를 직접 설정.
-- 운영자가 /admin/members 에서 리셋(NULL로 변경) 가능.

ALTER TABLE members ADD COLUMN IF NOT EXISTS pin_hash TEXT;
