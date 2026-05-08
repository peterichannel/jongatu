-- 멤버 PIN 셀프 리셋용 본인 확인 답변
-- 질문은 고정: "어머니 성함" (코드에서 라벨로 표시)
-- 멤버 본인이 첫 PIN 설정 시 함께 입력 (운영자는 모르는 정보)
-- PIN 분실 시 이름 + 어머니 성함 일치하면 새 PIN 설정 가능

ALTER TABLE members ADD COLUMN IF NOT EXISTS recovery_answer TEXT;

-- 만약 이전 0005_member_phone.sql 을 이미 실행하셨다면, 사용하지 않는 phone_last4 컬럼은 그대로 두셔도 무방합니다.
-- 정리하시려면: ALTER TABLE members DROP COLUMN IF EXISTS phone_last4;
