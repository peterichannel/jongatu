-- fund_transactions 에 페널티 정정용 reference + member 컬럼 추가
-- 자가 체크인 시점 즉시 페널티가 적용되고, 운영자가 status 정정 시 기존 페널티 행을 식별·역분개해야 하므로
-- (reference_type, reference_id, member_id) 로 회차·멤버 단위 페널티를 명확히 잡는다.
-- deposit_transactions 는 이미 reference_type/reference_id 가 있으므로 추가 불필요.

ALTER TABLE fund_transactions
  ADD COLUMN IF NOT EXISTS reference_type TEXT,
  ADD COLUMN IF NOT EXISTS reference_id UUID,
  ADD COLUMN IF NOT EXISTS member_id UUID REFERENCES members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fund_tx_reference
  ON fund_transactions(reference_type, reference_id);
CREATE INDEX IF NOT EXISTS idx_fund_tx_member
  ON fund_transactions(member_id);
