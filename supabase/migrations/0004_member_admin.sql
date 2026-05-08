-- 멤버 관리자 권한 (운영자 PIN 별도 인증 폐기 → 멤버 PIN + is_admin으로 통합)
-- 첫 운영자(이상호) 권한은 이 마이그레이션 실행 후 별도 SQL로 부여:
--   UPDATE members SET is_admin = true WHERE name IN ('양민기', '이우재', '이상호');

ALTER TABLE members ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_members_admin ON members(is_admin) WHERE is_admin = true;
