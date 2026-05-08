-- 평가 항목 3개 → 5개 확장 (qna, time_management 추가)
-- feedback NOT NULL 로 변경 (기존 NULL은 빈 문자열 백필)
-- listener_feedbacks 회차별 평가자 1건 UNIQUE 제약 추가
--
-- 기존 evaluations 행이 있으면 qna/time_management 는 3('보통') 으로 백필됩니다.
-- 추후 INSERT 는 명시적 값을 요구하도록 DEFAULT 를 제거합니다.

-- 1) qna, time_management 컬럼 추가 (백필용 DEFAULT 3, 이후 DEFAULT 제거)
ALTER TABLE evaluations
  ADD COLUMN IF NOT EXISTS qna INTEGER NOT NULL DEFAULT 3 CHECK (qna BETWEEN 1 AND 5);

ALTER TABLE evaluations
  ADD COLUMN IF NOT EXISTS time_management INTEGER NOT NULL DEFAULT 3 CHECK (time_management BETWEEN 1 AND 5);

ALTER TABLE evaluations ALTER COLUMN qna DROP DEFAULT;
ALTER TABLE evaluations ALTER COLUMN time_management DROP DEFAULT;

-- 2) feedback NOT NULL
UPDATE evaluations SET feedback = '' WHERE feedback IS NULL;
ALTER TABLE evaluations ALTER COLUMN feedback SET NOT NULL;

-- 3) listener_feedbacks UNIQUE(session_id, evaluator_id)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'listener_feedbacks_session_evaluator_uniq'
  ) THEN
    ALTER TABLE listener_feedbacks
      ADD CONSTRAINT listener_feedbacks_session_evaluator_uniq
      UNIQUE (session_id, evaluator_id);
  END IF;
END $$;
