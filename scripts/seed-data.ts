/**
 * 종가투 앱 데이터 동기화 스크립트
 *
 * 실행: npm run seed:data
 *
 * SCHEDULE.md 의 멤버/분기/회차/발표 데이터를 Supabase에 UPSERT 합니다.
 * 매칭 키:
 *   - members:       name
 *   - quarters:      name
 *   - sessions:      (quarter_id, session_number)
 *   - presentations: (session_id, slot)
 */

import { loadEnvConfig } from '@next/env'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

loadEnvConfig(process.cwd())

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceKey) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 가 .env.local 에 없습니다')
  process.exit(1)
}

const supabase: SupabaseClient = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
})

/* ─────────────── 멤버 데이터 ─────────────── */

const ACTIVE_ADMINS = ['이상호', '양민기', '이우재']

const ACTIVE_REGULAR = [
  '김동주', '서수민', '박경환', '이신우', '이애리', '임지향',
  '김윤정', '서유나', '김영호', '박성철', '최수진', '강성민',
  '유병우', '이종명'
]

const INACTIVE_MEMBERS = [
  '고상문', '권재두', '김남수', '김유민', '김지훈', '김창현',
  '박우승', '박재현', '박태유', '성영록', '이소연', '이예라',
  '장현빈', '조성열', '최민지'
]

const ACTIVE_JOINED_AT = '2026-05-08'
const INACTIVE_JOINED_AT = '2022-01-01'

/* ─────────────── 분기 데이터 ─────────────── */

const QUARTERS: Array<{
  name: string
  start_date: string
  end_date: string
  is_active: boolean
}> = [
  { name: '2022-Q2', start_date: '2022-08-31', end_date: '2022-12-14', is_active: false },
  { name: '2023-Q1', start_date: '2022-01-11', end_date: '2023-06-28', is_active: false },
  { name: '2023-Q2', start_date: '2023-07-26', end_date: '2023-12-27', is_active: false },
  { name: '2024-Q1', start_date: '2023-01-10', end_date: '2024-04-03', is_active: false },
  { name: '2024-Q2', start_date: '2024-04-17', end_date: '2024-07-24', is_active: false },
  { name: '2024-Q3', start_date: '2024-08-07', end_date: '2024-10-16', is_active: false },
  { name: '2024-Q4', start_date: '2024-10-30', end_date: '2024-12-18', is_active: false },
  { name: '2025-Q1', start_date: '2024-01-08', end_date: '2025-04-02', is_active: false },
  { name: '2025-Q2', start_date: '2025-04-16', end_date: '2025-07-02', is_active: false },
  { name: '2025-Q3', start_date: '2025-07-09', end_date: '2025-09-24', is_active: false },
  { name: '2025-Q4', start_date: '2025-10-15', end_date: '2025-12-17', is_active: false },
  { name: '2026-Q1', start_date: '2025-01-14', end_date: '2026-04-08', is_active: false },
  { name: '2026-Q2', start_date: '2026-04-08', end_date: '2026-07-08', is_active: true }
]

/* ─────────────── 회차 + 발표 ─────────────── */

type SessionDef = {
  n: number // session_number (0 가능)
  date: string
  type: 'normal' | 'rest' | 'dinner' | 'social' | 'event'
  note?: string
  slots?: Array<{
    slot: number
    presenter?: string // 멤버 이름
    company?: string
    special?: string // 그룹 활동 라벨 (예: "포트폴리오 발표")
  }>
}

const SCHEDULE: Record<string, SessionDef[]> = {
  '2022-Q2': [
    { n: 1, date: '2022-08-31', type: 'normal', slots: [
      { slot: 1, presenter: '김유민', company: '한솔케미칼' },
      { slot: 2, presenter: '김지훈', company: '노바렉스' }
    ]},
    { n: 2, date: '2022-09-28', type: 'normal', slots: [
      { slot: 1, presenter: '이예라', company: '한국조선해양' },
      { slot: 2, presenter: '고상문', company: '에스피지' }
    ]},
    { n: 3, date: '2022-10-19', type: 'normal', slots: [
      { slot: 1, presenter: '조성열', company: '제이시스메디칼' }
    ]},
    { n: 4, date: '2022-11-02', type: 'event', note: '저녁식사' },
    { n: 5, date: '2022-11-16', type: 'normal', slots: [
      { slot: 1, presenter: '이우재', company: '쌍용 C&E' },
      { slot: 2, presenter: '이소연', company: '알테오젠' }
    ]},
    { n: 6, date: '2022-11-30', type: 'normal', slots: [
      { slot: 1, presenter: '유병우', company: '풍산' },
      { slot: 2, presenter: '박태유', company: '위메이드' }
    ]},
    { n: 7, date: '2022-12-14', type: 'normal', slots: [
      { slot: 1, presenter: '양민기', company: 'LX세미콘' },
      { slot: 2, presenter: '이상호', company: '나이스정보통신' }
    ]}
  ],

  '2023-Q1': [
    { n: 0, date: '2022-01-11', type: 'event', note: '22년 결산 및 포트폴리오 발표 + Q&A' },
    { n: 1, date: '2023-01-25', type: 'normal', slots: [
      { slot: 1, special: '포트폴리오 발표' },
      { slot: 2, presenter: '박태유', company: 'TMF' }
    ]},
    { n: 2, date: '2023-02-08', type: 'normal', slots: [
      { slot: 1, presenter: '이상호', company: '사조대림' },
      { slot: 2, presenter: '김유민', company: '신흥에스이씨' }
    ]},
    { n: 3, date: '2023-02-22', type: 'normal', slots: [
      { slot: 1, presenter: '권재두', company: '피엔케이피부임상연구센타' },
      { slot: 2, presenter: '이종명', company: 'BGF리테일' }
    ]},
    { n: 4, date: '2023-03-15', type: 'normal', slots: [
      { slot: 1, presenter: '유병우', company: '슈프리마' },
      { slot: 2, presenter: '강성민', company: 'OCI' },
      { slot: 3, presenter: '김지훈', company: '케어젠' }
    ]},
    { n: 5, date: '2023-03-29', type: 'normal', slots: [
      { slot: 1, presenter: '김동주' },
      { slot: 2, presenter: '박우승', company: '영원무역홀딩스' },
      { slot: 3, presenter: '조성열', company: '한국조선해양' }
    ]},
    { n: 6, date: '2023-04-12', type: 'normal', slots: [
      { slot: 1, presenter: '권재두', company: '루닛' }
    ]},
    { n: 7, date: '2023-04-19', type: 'event', note: '종가투 회식' },
    { n: 8, date: '2023-05-03', type: 'normal', slots: [
      { slot: 1, presenter: '강성민', company: '현대미포조선' },
      { slot: 2, presenter: '김지훈', company: '한솔아이원스' }
    ]},
    { n: 9, date: '2023-05-17', type: 'normal', slots: [
      { slot: 1, presenter: '박태유', company: '한국항공우주' },
      { slot: 2, presenter: '김유민', company: '롯데칠성' }
    ]},
    { n: 10, date: '2023-05-31', type: 'normal', slots: [
      { slot: 1, presenter: '양민기' },
      { slot: 2, presenter: '김동주', company: '카니발(CCL)' }
    ]},
    { n: 11, date: '2023-06-14', type: 'normal', slots: [
      { slot: 1, presenter: '이우재', company: '천보' },
      { slot: 2, presenter: '유병우' },
      { slot: 3, presenter: '이상호', company: '제이씨케미칼' }
    ]},
    { n: 12, date: '2023-06-28', type: 'normal', slots: [
      { slot: 1, presenter: '박우승', company: '송원산업' },
      { slot: 2, presenter: '이종명' }
    ]}
  ],

  '2023-Q2': [
    { n: 1, date: '2023-07-26', type: 'normal', slots: [
      { slot: 1, presenter: '김지훈', company: '태웅' }
    ]},
    { n: 2, date: '2023-08-09', type: 'normal', slots: [
      { slot: 1, presenter: '강성민', company: '인화정공' },
      { slot: 2, presenter: '권재두', company: '엘앤케이바이오' }
    ]},
    { n: 3, date: '2023-08-23', type: 'normal', slots: [
      { slot: 1, presenter: '이상호', company: 'HD현대일렉트릭' },
      { slot: 2, presenter: '박태유', company: '비욘드미트' }
    ]},
    { n: 4, date: '2023-09-06', type: 'normal', slots: [
      { slot: 1, presenter: '김유민', company: 'kt&g' },
      { slot: 2, presenter: '김지훈', company: 'OLED 산업 동향' }
    ]},
    { n: 5, date: '2023-09-20', type: 'normal', slots: [
      { slot: 1, presenter: '이종명', company: '쿠팡' },
      { slot: 2, presenter: '박우승', company: 'DN오토모티브' }
    ]},
    { n: 6, date: '2023-10-04', type: 'normal', slots: [
      { slot: 1, presenter: '유병우', company: '케이알엠' },
      { slot: 2, presenter: '김동주', company: '농우바이오' }
    ]},
    { n: 7, date: '2023-10-18', type: 'event', note: '신규 스터디원 환영회' },
    { n: 8, date: '2023-11-01', type: 'normal', slots: [
      { slot: 1, presenter: '이상호', company: '아세아시멘트' },
      { slot: 2, presenter: '이우재', company: '자산운용업 (기업의 자금조달)' }
    ]},
    { n: 9, date: '2023-11-15', type: 'normal', slots: [
      { slot: 1, presenter: '박태유', company: '기가비스' },
      { slot: 2, presenter: '박우승', company: '제일기획' },
      { slot: 3, presenter: '성영록', company: '미스터블루' }
    ]},
    { n: 10, date: '2023-11-29', type: 'normal', slots: [
      { slot: 1, presenter: '장현빈', company: 'GS건설' },
      { slot: 2, presenter: '강성민', company: '오스코텍' },
      { slot: 3, presenter: '유병우', company: '현대이지웰' }
    ]},
    { n: 11, date: '2023-12-06', type: 'event', note: '송년회' },
    { n: 12, date: '2023-12-13', type: 'normal', slots: [
      { slot: 1, presenter: '김지훈', company: '파수' },
      { slot: 2, presenter: '김동주', company: 'SE' }
    ]},
    { n: 13, date: '2023-12-27', type: 'normal', slots: [
      { slot: 1, presenter: '김창현', company: 'E1' },
      { slot: 2, presenter: '김유민', company: '인텔리안테크' },
      { slot: 3, presenter: '최민지', company: '팔란티어 테크놀로지스' }
    ]}
  ],

  '2024-Q1': [
    { n: 1, date: '2023-01-10', type: 'normal', slots: [
      { slot: 1, presenter: '김창현', company: 'E1' },
      { slot: 2, presenter: '김유민', company: '인텔리안테크' }
    ]},
    { n: 2, date: '2023-01-24', type: 'normal', slots: [
      { slot: 1, special: '포트폴리오 발표' }
    ]},
    { n: 3, date: '2023-02-07', type: 'normal', slots: [
      { slot: 1, special: '포트폴리오 발표' },
      { slot: 2, presenter: '김동주', company: '대한약품' },
      { slot: 3, presenter: '박재현', company: '파마리서치' }
    ]},
    { n: 4, date: '2023-02-21', type: 'normal', slots: [
      { slot: 1, presenter: '박우승', company: '코세스' },
      { slot: 2, presenter: '이우재', company: '솔브레인/솔브레인홀딩스' },
      { slot: 3, presenter: '이종명', company: '한국콜마' }
    ]},
    { n: 5, date: '2023-03-06', type: 'normal', slots: [
      { slot: 1, presenter: '성영록', company: '다날' },
      { slot: 2, presenter: '장현빈', company: '호텔신라' },
      { slot: 3, presenter: '최수진', company: 'CVS' }
    ]},
    { n: 6, date: '2023-03-20', type: 'normal', slots: [
      { slot: 1, presenter: '박성철', company: '한양증권' },
      { slot: 2, presenter: '유병우', company: '아세아시멘트' },
      { slot: 3, presenter: '김유민', company: '코웨이' }
    ]},
    { n: 7, date: '2024-04-03', type: 'normal', slots: [
      { slot: 1, presenter: '강성민', company: '아이센스' },
      { slot: 2, presenter: '김창현', company: '메가젠 임플란트' },
      { slot: 3, presenter: '양민기', company: '유니티소프트웨어' }
    ]}
  ],

  '2024-Q2': [
    { n: 1, date: '2024-04-17', type: 'event', note: '회식' },
    { n: 2, date: '2024-04-24', type: 'event', note: '티 타임 (19:10 ~ 19:30)' },
    { n: 3, date: '2024-05-08', type: 'event', note: '어버이날' },
    { n: 4, date: '2024-05-22', type: 'normal', slots: [
      { slot: 1, presenter: '이상호', company: '씨에스윈드' },
      { slot: 2, presenter: '박성철', company: '코텍' }
    ]},
    { n: 5, date: '2024-06-12', type: 'normal', slots: [
      { slot: 1, presenter: '박재현', company: '제이브이엠' },
      { slot: 2, presenter: '김동주', company: '진에어' },
      { slot: 3, presenter: '강성민', company: '오스코텍' }
    ]},
    { n: 6, date: '2024-06-26', type: 'normal', slots: [
      { slot: 1, presenter: '성영록', company: '태경케미컬' },
      { slot: 2, presenter: '김유민', company: '한샘' },
      { slot: 3, presenter: '최수진', company: 'MU' }
    ]},
    { n: 7, date: '2024-07-10', type: 'normal', slots: [
      { slot: 1, presenter: '양민기', company: '로블록스' },
      { slot: 2, presenter: '장현빈', company: '반도체 바스켓' }
    ]},
    { n: 8, date: '2024-07-24', type: 'normal', slots: [
      { slot: 1, presenter: '유병우', company: '지누스' },
      { slot: 2, presenter: '이우재', company: '에이피알' },
      { slot: 3, presenter: '이종명', company: '대한항공' }
    ]}
  ],

  '2024-Q3': [
    { n: 1, date: '2024-08-07', type: 'normal', slots: [
      { slot: 1, presenter: '박성철' },
      { slot: 2, presenter: '김동주', company: '두산밥캣 or 오리온 or 코엔텍' }
    ]},
    { n: 2, date: '2024-08-21', type: 'normal', slots: [
      { slot: 1, presenter: '이종명', company: '한국타이어앤테크놀러지' },
      { slot: 2, presenter: '이상호', company: '수산인더스트리' }
    ]},
    { n: 3, date: '2024-09-04', type: 'normal', slots: [
      { slot: 1, presenter: '장현빈', company: '하이브 or 코스맥스' },
      { slot: 2, presenter: '강성민', company: '코오롱티슈진' }
    ]},
    { n: 4, date: '2024-09-25', type: 'normal', slots: [
      { slot: 1, presenter: '이우재', company: 'SOOP' },
      { slot: 2, presenter: '김유민', company: '쿠쿠홀딩스' }
    ]},
    { n: 5, date: '2024-10-16', type: 'normal', slots: [
      { slot: 1, presenter: '유병우', company: '비트코인' },
      { slot: 2, presenter: '최수진', company: 'ONON' }
    ]}
  ],

  '2024-Q4': [
    { n: 1, date: '2024-10-30', type: 'normal', slots: [
      { slot: 1, presenter: '강성민', company: '1)코어스템켐온 2)큐리옥스바이오시스템즈' },
      { slot: 2, presenter: '이상호', company: '우버' }
    ]},
    { n: 2, date: '2024-11-13', type: 'normal', slots: [
      { slot: 1, presenter: '김동주' },
      { slot: 2, presenter: '박성철', company: '금융지주 지금 투자해도 되나요' },
      { slot: 3, presenter: '장현빈' }
    ]},
    { n: 3, date: '2024-11-27', type: 'normal', slots: [
      { slot: 1, presenter: '이우재', company: '성우' },
      { slot: 2, presenter: '김유민', company: '한섬' }
    ]},
    { n: 4, date: '2024-12-11', type: 'normal', slots: [
      { slot: 1, presenter: '유병우' },
      { slot: 2, presenter: '최수진' },
      { slot: 3, presenter: '이종명' }
    ]},
    { n: 5, date: '2024-12-18', type: 'event', note: '송년회' }
  ],

  '2025-Q1': [
    { n: 1, date: '2024-01-08', type: 'normal', slots: [
      { slot: 1, presenter: '강성민', company: '펩트론' },
      { slot: 2, presenter: '박성철', company: '아이디피' }
    ]},
    { n: 2, date: '2024-01-22', type: 'event', note: '포트폴리오 발표' },
    { n: 3, date: '2024-02-05', type: 'normal', slots: [
      { slot: 1, presenter: '김남수', company: '테슬라' },
      { slot: 2, presenter: '이종명', company: '오스테오닉' }
    ]},
    { n: 4, date: '2024-02-19', type: 'normal', slots: [
      { slot: 1, presenter: '이상호', company: '실리콘투' },
      { slot: 2, presenter: '김유민', company: '동원 F&B' },
      { slot: 3, presenter: '김영호', company: '일신방직' }
    ]},
    { n: 5, date: '2024-03-05', type: 'event', note: '1분기 회식' },
    { n: 6, date: '2024-03-19', type: 'normal', slots: [
      { slot: 1, presenter: '김동주', company: '컴투스' },
      { slot: 2, presenter: '최수진', company: 'VZ' },
      { slot: 3, presenter: '김윤정', company: 'Ap위성' }
    ]},
    { n: 7, date: '2025-04-02', type: 'normal', slots: [
      { slot: 1, presenter: '유병우', company: '인카금융서비스' },
      { slot: 2, presenter: '서유나', company: '휴메딕스' }
    ]}
  ],

  '2025-Q2': [
    { n: 1, date: '2025-04-16', type: 'normal', slots: [
      { slot: 1, presenter: '박성철', company: '삼영무역' },
      { slot: 2, presenter: '김동주', company: '미트박스/메지온' }
    ]},
    { n: 2, date: '2025-05-07', type: 'event', note: '방학 (가정의 달)' },
    { n: 3, date: '2025-05-21', type: 'normal', slots: [
      { slot: 1, presenter: '강성민', company: '큐리옥스바이오' },
      { slot: 2, presenter: '김윤정', company: '로보티즈' },
      { slot: 3, presenter: '이우재', company: '듀켐바이오' }
    ]},
    { n: 4, date: '2025-06-04', type: 'normal', slots: [
      { slot: 1, presenter: '김유민', company: '에스에프에이' },
      { slot: 2, presenter: '이상호', company: '넥스틴' }
    ]},
    { n: 5, date: '2025-06-18', type: 'normal', slots: [
      { slot: 1, presenter: '최수진', company: 'MSFT' },
      { slot: 2, presenter: '김영호', company: '현대해상' },
      { slot: 3, presenter: '유병우', company: '인바디' }
    ]},
    { n: 6, date: '2025-07-02', type: 'normal', slots: [
      { slot: 1, presenter: '이종명', company: '한국기업평가' },
      { slot: 2, presenter: '김남수', company: 'Kodex 미국AI테크TOP10타겟커버드콜' },
      { slot: 3, presenter: '서유나', company: '삼성바이오로직스' }
    ]}
  ],

  '2025-Q3': [
    { n: 1, date: '2025-07-09', type: 'event', note: '회식' },
    { n: 2, date: '2025-07-23', type: 'normal', slots: [
      { slot: 1, presenter: '양민기', company: '상반기 결산 및 하반기 Kick-off' },
      { slot: 2, presenter: '박성철', company: 'SJM' }
    ]},
    { n: 3, date: '2025-08-06', type: 'normal', slots: [
      { slot: 1, presenter: '양민기', company: 'Astera Labs (미국 반도체)' },
      { slot: 2, presenter: '김동주', company: '네오이뮨텍' },
      { slot: 3, presenter: '김윤정', company: 'YG 플러스' }
    ]},
    { n: 4, date: '2025-08-20', type: 'normal', slots: [
      { slot: 1, presenter: '이종명', company: '삼성E&A' },
      { slot: 2, presenter: '이상호', company: '오리엔탈정공' },
      { slot: 3, presenter: '유병우', company: '우양에이치씨' }
    ]},
    { n: 5, date: '2025-09-10', type: 'normal', slots: [
      { slot: 1, presenter: '강성민', company: '펩트론 매도플랜' },
      { slot: 2, presenter: '김영호', company: 'DN오토모티브' },
      { slot: 3, presenter: '최수진', company: '화이자' }
    ]},
    { n: 6, date: '2025-09-24', type: 'normal', slots: [
      { slot: 1, presenter: '이우재', company: '코미코' },
      { slot: 2, presenter: '김유민', company: '화신' },
      { slot: 3, presenter: '서유나', company: '원전 밸류체인' }
    ]}
  ],

  '2025-Q4': [
    { n: 1, date: '2025-10-15', type: 'normal', slots: [
      { slot: 1, presenter: '박성철', company: '지수(index) 투자' },
      { slot: 2, presenter: '최수진', company: 'TEMPUS AI' },
      { slot: 3, presenter: '서유나', company: '카메코(CCJ)' }
    ]},
    { n: 2, date: '2025-10-29', type: 'normal', slots: [
      { slot: 1, presenter: '김동주', company: '로킷헬스케어, 이노스페이스33R (다음기회: 대창단조, 하나마이크론)' }
    ]},
    { n: 3, date: '2025-11-12', type: 'normal', note: '파티룸 저녁식사', slots: [
      { slot: 1, presenter: '이상호', company: '테크윙' },
      { slot: 2, presenter: '강성민', company: 'TEMPUS AI' },
      { slot: 3, presenter: '김윤정', company: '산일전기' }
    ]},
    { n: 4, date: '2025-11-26', type: 'normal', slots: [
      { slot: 1, presenter: '이우재', company: 'SAMG엔터' },
      { slot: 2, presenter: '김영호', company: '삼양사' }
    ]},
    { n: 5, date: '2025-12-10', type: 'event', note: '송년회' },
    { n: 6, date: '2025-12-17', type: 'normal', slots: [
      { slot: 1, presenter: '이종명', company: '종목 기입 예정' },
      { slot: 2, presenter: '유병우', company: '아이렌' }
    ]}
  ],

  '2026-Q1': [
    { n: 1, date: '2025-01-14', type: 'normal', slots: [
      { slot: 1, presenter: '양민기', company: '스터디 안내' },
      { slot: 2, special: '포트폴리오 발표 (스터디원 전원)' }
    ]},
    { n: 2, date: '2025-01-28', type: 'normal', slots: [
      { slot: 1, presenter: '김동주', company: '하모닉드라이브시스템즈' },
      { slot: 2, presenter: '박성철', company: '금융지주 투자' },
      { slot: 3, presenter: '이상호', company: 'LS머트리얼즈' }
    ]},
    { n: 3, date: '2025-02-11', type: 'normal', slots: [
      { slot: 1, presenter: '임지향', company: '아이엠지티' },
      { slot: 2, presenter: '강성민', company: 'helus pharma' },
      { slot: 3, presenter: '김윤정', company: 'RFHIC' }
    ]},
    { n: 4, date: '2025-02-25', type: 'normal', slots: [
      { slot: 1, presenter: '서유나', company: '피팅기업(성광벤드,태광)' },
      { slot: 2, presenter: '유병우', company: '씨에스윈드' },
      { slot: 3, presenter: '박경환', company: '빙그레' }
    ]},
    { n: 5, date: '2025-03-11', type: 'normal', slots: [
      { slot: 1, presenter: '이애리', company: '아이티켐' },
      { slot: 2, presenter: '최수진', company: 'AMEX' },
      { slot: 3, special: '간단한 맥주' }
    ]},
    { n: 6, date: '2025-03-25', type: 'normal', slots: [
      { slot: 1, presenter: '김영호', company: '케이프' },
      { slot: 2, presenter: '이종명', company: '효성티앤씨' }
    ]},
    { n: 7, date: '2026-04-08', type: 'normal', slots: [
      { slot: 1, presenter: '서수민', company: '써클 / 코인베이스' },
      { slot: 2, presenter: '이신우', company: '무학' }
    ]}
  ],

  '2026-Q2': [
    { n: 1, date: '2026-04-08', type: 'normal', note: '이신우 무학발표는 4월 8일 (1분기 시트 참고)', slots: [
      { slot: 1, presenter: '서수민', company: '써클 / 코인베이스 (1분기 대상)' },
      { slot: 2, presenter: '이신우', company: '무학 (1분기 대상)' },
      { slot: 3, presenter: '김동주', company: '삼양바이오팜' }
    ]},
    { n: 2, date: '2026-04-22', type: 'event', note: '휴식' },
    { n: 3, date: '2026-05-06', type: 'normal', slots: [
      { slot: 1, presenter: '박성철', company: '아이디스홀딩스' },
      { slot: 2, presenter: '이상호', company: '아이온큐 (IONQ)' }
    ]},
    { n: 4, date: '2026-05-20', type: 'normal', slots: [
      { slot: 1, presenter: '임지향' },
      { slot: 2, presenter: '박경환' },
      { slot: 3, presenter: '최수진' }
    ]},
    { n: 5, date: '2026-06-10', type: 'normal', slots: [
      { slot: 1, presenter: '이종명' },
      { slot: 2, presenter: '김영호' },
      { slot: 3, presenter: '이신우' }
    ]},
    { n: 6, date: '2026-06-24', type: 'normal', slots: [
      { slot: 1, presenter: '서유나' },
      { slot: 2, presenter: '서수민' },
      { slot: 3, presenter: '김윤정' }
    ]},
    { n: 7, date: '2026-07-08', type: 'normal', slots: [
      { slot: 1, presenter: '강성민' },
      { slot: 2, presenter: '유병우' },
      { slot: 3, presenter: '이애리' }
    ]}
  ]
}

/* ─────────────── 동기화 로직 ─────────────── */

async function syncMembers(): Promise<Map<string, string>> {
  console.log('▶ members 동기화')
  const rows: Array<{
    name: string
    is_active: boolean
    is_admin: boolean
    joined_at: string
  }> = []
  for (const name of ACTIVE_ADMINS) {
    rows.push({ name, is_active: true, is_admin: true, joined_at: ACTIVE_JOINED_AT })
  }
  for (const name of ACTIVE_REGULAR) {
    rows.push({ name, is_active: true, is_admin: false, joined_at: ACTIVE_JOINED_AT })
  }
  for (const name of INACTIVE_MEMBERS) {
    rows.push({ name, is_active: false, is_admin: false, joined_at: INACTIVE_JOINED_AT })
  }

  // members.name 에 UNIQUE 제약이 없으므로 직접 SELECT → INSERT/UPDATE
  const { data: existing, error: selErr } = await supabase
    .from('members')
    .select('id, name')
  if (selErr) throw new Error(`members select: ${selErr.message}`)
  const byName = new Map<string, string>()
  for (const m of existing ?? []) byName.set(m.name, m.id)

  const toInsert: typeof rows = []
  const toUpdate: Array<{ id: string; row: (typeof rows)[number] }> = []
  for (const row of rows) {
    const id = byName.get(row.name)
    if (id) toUpdate.push({ id, row })
    else toInsert.push(row)
  }

  if (toInsert.length > 0) {
    const { data, error } = await supabase.from('members').insert(toInsert).select('id, name')
    if (error) throw new Error(`members insert: ${error.message}`)
    for (const m of data ?? []) byName.set(m.name, m.id)
    console.log(`  + INSERT ${toInsert.length}명`)
  }
  if (toUpdate.length > 0) {
    for (const { id, row } of toUpdate) {
      const { error } = await supabase
        .from('members')
        .update({ is_active: row.is_active, is_admin: row.is_admin, joined_at: row.joined_at })
        .eq('id', id)
      if (error) throw new Error(`members update ${row.name}: ${error.message}`)
    }
    console.log(`  ~ UPDATE ${toUpdate.length}명`)
  }
  return byName
}

async function syncQuarters(): Promise<Map<string, string>> {
  console.log('▶ quarters 동기화')

  // 기존 시드의 '26-2' 분기를 '2026-Q2' 로 rename (한 번만 동작)
  const { error: renameErr } = await supabase
    .from('quarters')
    .update({ name: '2026-Q2' })
    .eq('name', '26-2')
  if (renameErr && !renameErr.message.includes('duplicate')) {
    console.warn(`  ⚠ rename 26-2 → 2026-Q2: ${renameErr.message}`)
  }

  const { error } = await supabase
    .from('quarters')
    .upsert(QUARTERS, { onConflict: 'name' })
  if (error) throw new Error(`quarters upsert: ${error.message}`)

  const { data: rows } = await supabase.from('quarters').select('id, name')
  const map = new Map<string, string>()
  for (const q of rows ?? []) map.set(q.name, q.id)
  console.log(`  ✓ ${QUARTERS.length}개 분기 동기화`)
  return map
}

async function syncSchedule(
  memberMap: Map<string, string>,
  quarterMap: Map<string, string>
) {
  console.log('▶ sessions + presentations 동기화')

  let sessionInserted = 0
  let sessionUpdated = 0
  let presUpserted = 0
  let unmatchedNames = new Set<string>()

  for (const [quarterName, sessions] of Object.entries(SCHEDULE)) {
    const quarterId = quarterMap.get(quarterName)
    if (!quarterId) {
      console.warn(`  ⚠ 분기 "${quarterName}" 매칭 실패`)
      continue
    }

    // 기존 세션 조회
    const { data: existingSessions } = await supabase
      .from('sessions')
      .select('id, session_number')
      .eq('quarter_id', quarterId)
    const sessionByNum = new Map<number, string>()
    for (const s of existingSessions ?? []) sessionByNum.set(s.session_number, s.id)

    for (const sess of sessions) {
      const existingId = sessionByNum.get(sess.n)
      const sessionRow = {
        quarter_id: quarterId,
        session_number: sess.n,
        date: sess.date,
        type: sess.type,
        note: sess.note ?? null
      }
      let sessionId: string
      if (existingId) {
        const { error } = await supabase
          .from('sessions')
          .update(sessionRow)
          .eq('id', existingId)
        if (error) throw new Error(`session update ${quarterName} #${sess.n}: ${error.message}`)
        sessionId = existingId
        sessionUpdated += 1
      } else {
        const { data, error } = await supabase
          .from('sessions')
          .insert(sessionRow)
          .select('id')
          .single()
        if (error || !data) throw new Error(`session insert ${quarterName} #${sess.n}: ${error?.message}`)
        sessionId = data.id
        sessionInserted += 1
      }

      // 발표 동기화
      if (!sess.slots || sess.slots.length === 0) {
        // event 회차: 기존 발표가 있으면 삭제
        await supabase.from('presentations').delete().eq('session_id', sessionId)
        continue
      }

      const { data: existingPres } = await supabase
        .from('presentations')
        .select('id, slot')
        .eq('session_id', sessionId)
      const presBySlot = new Map<number, string>()
      for (const p of existingPres ?? []) presBySlot.set(p.slot, p.id)

      for (const s of sess.slots) {
        let presenter_id: string | null = null
        if (s.presenter) {
          const memberId = memberMap.get(s.presenter)
          if (memberId) {
            presenter_id = memberId
          } else {
            unmatchedNames.add(s.presenter)
          }
        }
        const presRow = {
          session_id: sessionId,
          slot: s.slot,
          presenter_id,
          company_name: s.company ?? null,
          cafe_url: null,
          special_label: s.special ?? null,
          reserved_at: presenter_id ? new Date().toISOString() : null
        }
        const existingPresId = presBySlot.get(s.slot)
        if (existingPresId) {
          const { error } = await supabase
            .from('presentations')
            .update(presRow)
            .eq('id', existingPresId)
          if (error) throw new Error(`pres update ${quarterName} #${sess.n}.${s.slot}: ${error.message}`)
        } else {
          const { error } = await supabase.from('presentations').insert(presRow)
          if (error) throw new Error(`pres insert ${quarterName} #${sess.n}.${s.slot}: ${error.message}`)
        }
        presUpserted += 1
      }
    }
  }

  console.log(
    `  ✓ sessions: +${sessionInserted}건, ~${sessionUpdated}건 / presentations: ${presUpserted}건`
  )
  if (unmatchedNames.size > 0) {
    console.warn(`  ⚠ 매칭 안 된 발표자 이름: ${Array.from(unmatchedNames).join(', ')}`)
  }
}

async function summary(memberMap: Map<string, string>, quarterMap: Map<string, string>) {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('동기화 완료 요약')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  const { count: memberCount } = await supabase
    .from('members')
    .select('*', { count: 'exact', head: true })
  const { count: activeCount } = await supabase
    .from('members')
    .select('*', { count: 'exact', head: true })
    .eq('is_active', true)
  const { count: adminCount } = await supabase
    .from('members')
    .select('*', { count: 'exact', head: true })
    .eq('is_admin', true)
  const { count: quarterCount } = await supabase
    .from('quarters')
    .select('*', { count: 'exact', head: true })
  const { count: sessionCount } = await supabase
    .from('sessions')
    .select('*', { count: 'exact', head: true })
  const { count: presCount } = await supabase
    .from('presentations')
    .select('*', { count: 'exact', head: true })
  console.log(`멤버:       총 ${memberCount}명 (활성 ${activeCount}, 운영자 ${adminCount})`)
  console.log(`분기:       ${quarterCount}개`)
  console.log(`회차:       ${sessionCount}개`)
  console.log(`발표 슬롯:  ${presCount}개`)
  console.log(`(memberMap: ${memberMap.size}, quarterMap: ${quarterMap.size})`)
}

;(async () => {
  try {
    const memberMap = await syncMembers()
    const quarterMap = await syncQuarters()
    await syncSchedule(memberMap, quarterMap)
    await summary(memberMap, quarterMap)
  } catch (e) {
    console.error('\n❌ 동기화 실패:', e instanceof Error ? e.message : e)
    process.exit(1)
  }
})()
