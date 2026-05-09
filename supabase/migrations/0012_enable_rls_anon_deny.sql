-- 모든 public 테이블에 RLS ON, 정책은 추가하지 않음 → anon/authenticated 전부 거부.
-- 앱은 server.ts 의 service_role 키로만 접근하므로 RLS 를 우회한다 (정상 동작).
-- 목적: anon key 가 어딘가에서 유출되더라도 deposits / evaluations 등 민감 테이블이
--       바로 통째로 읽히지 않도록 하는 1차 방어선.

ALTER TABLE members                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE quarters                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pre_attendances               ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendances                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE presentations                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluations                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE listener_feedbacks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposits                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposit_transactions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE fund_transactions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE penalty_rules                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE presentation_reservation_logs ENABLE ROW LEVEL SECURITY;
