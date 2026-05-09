-- 회차별 지각 판정 기준 시각 (자정 기준 분 단위)
-- NULL = 기본값(19:20 = 1160) 사용
-- 예) 16:30 → 16*60 + 30 = 990
-- 테스트 회차에서 임의 시각으로 출석/지각 시뮬레이션할 때 사용

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS late_after_minutes INTEGER;
