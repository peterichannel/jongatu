-- 분기 운영비 (각출액) 컬럼 추가
-- 22년 하반기 결산 기준: 운영비 30,000원 + 보증금 30,000원 = 60,000원/인 분기 신청
-- default_deposit (기존) 은 보증금 부분, operating_fee (신규) 는 운영비 부분
-- 분기 정산서에서 (운영비 + 보증금) - 잔액 = 다음 분기 신청금액 산출

ALTER TABLE quarters ADD COLUMN IF NOT EXISTS operating_fee INTEGER NOT NULL DEFAULT 30000;
