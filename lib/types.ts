export type Member = {
  id: string
  name: string
  joined_at: string
  is_active: boolean
  created_at: string
  pin_hash?: string | null
  is_admin?: boolean
  recovery_answer?: string | null
}

export type Quarter = {
  id: string
  name: string
  start_date: string
  end_date: string
  default_deposit: number
  operating_fee: number
  is_active: boolean
  created_at: string
}

export type PenaltyRule = {
  id: string
  rule_key: string
  rule_name: string
  amount: number
  is_active: boolean
}

export type Session = {
  id: string
  quarter_id: string
  session_number: number
  date: string
  type: 'normal' | 'rest' | 'dinner' | 'social' | 'event'
  note: string | null
  is_test: boolean
}

export type Presentation = {
  id: string
  session_id: string
  slot: number
  presenter_id: string | null
  company_name: string | null
  cafe_url: string | null
  special_label?: string | null
  reserved_at?: string | null
  company_updated_at?: string | null
}
