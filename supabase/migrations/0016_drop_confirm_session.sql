-- 출결 "최종 확인 / 잠금" 단계 폐기
--
-- 0015에서 confirm_session_attendance 를 재정의했으나, 운영 정책 변경:
--   - 자가 체크인 시점에 페널티가 즉시 차감되도록 바뀌었고
--   - 운영자가 status 정정하면 그 시점에 다시 동기화되므로
--   - 별도 "최종 확인" 일괄 단계가 불필요. 잠금(is_confirmed) 개념도 사용 중단.
--
-- 사전참석 미응답 페널티는 회차 종료 시점에 cron 으로 별도 자동 적용 예정 (다음 단계).
--
-- attendances.is_confirmed 컬럼 자체는 안전상 그대로 두되, UI/로직에서 더 이상 참조하지 않음.

DROP FUNCTION IF EXISTS confirm_session_attendance(UUID);
