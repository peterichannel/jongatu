-- jongatu-app 초기 스키마
-- Supabase RLS는 비활성화 상태 유지 (서버 단에서 service role로만 접근)

CREATE TABLE quarters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  default_deposit INTEGER NOT NULL DEFAULT 45000,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  joined_at DATE NOT NULL DEFAULT CURRENT_DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_members_active ON members(is_active);

CREATE TABLE deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  quarter_id UUID NOT NULL REFERENCES quarters(id) ON DELETE CASCADE,
  initial_amount INTEGER NOT NULL,
  current_balance INTEGER NOT NULL,
  UNIQUE(member_id, quarter_id)
);
CREATE INDEX idx_deposits_member ON deposits(member_id);
CREATE INDEX idx_deposits_quarter ON deposits(quarter_id);

CREATE TABLE deposit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_id UUID NOT NULL REFERENCES deposits(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_deposit_tx_deposit ON deposit_transactions(deposit_id);

CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quarter_id UUID NOT NULL REFERENCES quarters(id) ON DELETE CASCADE,
  session_number INTEGER NOT NULL,
  date DATE NOT NULL,
  type TEXT NOT NULL DEFAULT 'normal' CHECK (type IN ('normal', 'rest', 'dinner', 'social')),
  note TEXT,
  UNIQUE(quarter_id, session_number)
);
CREATE INDEX idx_sessions_date ON sessions(date);
CREATE INDEX idx_sessions_quarter ON sessions(quarter_id);

CREATE TABLE presentations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL,
  presenter_ids UUID[] NOT NULL,
  company_name TEXT,
  cafe_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, slot)
);
CREATE INDEX idx_presentations_session ON presentations(session_id);

CREATE TABLE pre_attendances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('attending', 'absent')),
  reason TEXT,
  responded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(session_id, member_id)
);

CREATE TABLE attendances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('present', 'late', 'absent', 'excused')),
  checked_in_at TIMESTAMPTZ,
  is_confirmed BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(session_id, member_id)
);
CREATE INDEX idx_attendances_session ON attendances(session_id);

CREATE TABLE evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  evaluator_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  presentation_id UUID NOT NULL REFERENCES presentations(id) ON DELETE CASCADE,
  preparation INTEGER NOT NULL CHECK (preparation BETWEEN 1 AND 5),
  delivery INTEGER NOT NULL CHECK (delivery BETWEEN 1 AND 5),
  attractiveness INTEGER NOT NULL CHECK (attractiveness BETWEEN 1 AND 5),
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(evaluator_id, presentation_id)
);
CREATE INDEX idx_evaluations_presentation ON evaluations(presentation_id);

CREATE TABLE listener_feedbacks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  evaluator_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE fund_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quarter_id UUID NOT NULL REFERENCES quarters(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('studyroom', 'meal', 'snack', 'gift', 'penalty', 'membership', 'other')),
  description TEXT,
  date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_fund_tx_quarter ON fund_transactions(quarter_id);

CREATE TABLE penalty_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key TEXT NOT NULL UNIQUE,
  rule_name TEXT NOT NULL,
  amount INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true
);
