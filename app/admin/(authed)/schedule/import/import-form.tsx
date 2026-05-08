'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import * as XLSX from 'xlsx'
import { Download, Upload, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Member, Quarter } from '@/lib/types'
import { SESSION_TYPE_LABEL } from '../session-form'

type ParsedRow = {
  rowNum: number
  session_number: number
  date: string
  type: 'normal' | 'rest' | 'dinner' | 'social' | 'event'
  note: string
  slot: number | null
  presenter_names: string[]
  company_name: string
  cafe_url: string
}

type ParseError = { rowNum: number; message: string }

type ImportResult = {
  created_sessions: number
  reused_sessions: number
  created_presentations: number
  skipped_presentations: number
  unmatched_names: string[]
  errors: { row: number; message: string }[]
}

const TEMPLATE_HEADERS = [
  'session_number',
  'date',
  'type',
  'note',
  'slot',
  'presenter1',
  'presenter2',
  'company_name',
  'cafe_url'
] as const

const TEMPLATE_SAMPLE_ROWS = [
  {
    session_number: 1,
    date: '2026-04-07',
    type: 'normal',
    note: '',
    slot: 1,
    presenter1: '홍길동',
    presenter2: '',
    company_name: '삼성전자',
    cafe_url: 'https://cafe.naver.com/jvi/...'
  },
  {
    session_number: 1,
    date: '2026-04-07',
    type: 'normal',
    note: '',
    slot: 2,
    presenter1: '김철수',
    presenter2: '박영희',
    company_name: 'LG전자',
    cafe_url: ''
  },
  {
    session_number: 2,
    date: '2026-04-14',
    type: 'rest',
    note: '추석 휴강',
    slot: '',
    presenter1: '',
    presenter2: '',
    company_name: '',
    cafe_url: ''
  }
]

function downloadTemplate() {
  const ws = XLSX.utils.json_to_sheet(TEMPLATE_SAMPLE_ROWS, { header: [...TEMPLATE_HEADERS] })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '일정')
  XLSX.writeFile(wb, 'jongatu-schedule-template.xlsx')
}

function normalizeDate(v: unknown): string {
  if (typeof v === 'string') return v.trim()
  if (v instanceof Date) {
    const y = v.getFullYear()
    const m = String(v.getMonth() + 1).padStart(2, '0')
    const d = String(v.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  if (typeof v === 'number') {
    // xlsx serial date
    const epoch = new Date(Math.round((v - 25569) * 86400 * 1000))
    const y = epoch.getUTCFullYear()
    const m = String(epoch.getUTCMonth() + 1).padStart(2, '0')
    const d = String(epoch.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return ''
}

function parseRows(rows: Record<string, unknown>[]): { parsed: ParsedRow[]; errors: ParseError[] } {
  const parsed: ParsedRow[] = []
  const errors: ParseError[] = []
  rows.forEach((raw, idx) => {
    const rowNum = idx + 2 // +2 = 헤더 1줄 + 0-based
    const session_number = Number(raw.session_number)
    const date = normalizeDate(raw.date)
    const type = String(raw.type ?? '').trim().toLowerCase() as ParsedRow['type']
    const note = String(raw.note ?? '').trim()
    const slotRaw = raw.slot
    const slot =
      slotRaw === '' || slotRaw === null || slotRaw === undefined ? null : Number(slotRaw)
    const presenter1 = String(raw.presenter1 ?? '').trim()
    const presenter2 = String(raw.presenter2 ?? '').trim()
    const company_name = String(raw.company_name ?? '').trim()
    const cafe_url = String(raw.cafe_url ?? '').trim()

    if (!session_number || session_number < 1) {
      errors.push({ rowNum, message: 'session_number(회차번호)가 비어있거나 잘못됐습니다' })
      return
    }
    if (!date) {
      errors.push({ rowNum, message: 'date(날짜)가 비어있습니다 (YYYY-MM-DD 형식)' })
      return
    }
    if (!['normal', 'rest', 'dinner', 'social', 'event'].includes(type)) {
      errors.push({
        rowNum,
        message: `type 값이 잘못됐습니다 (normal/rest/dinner/social/event 중 하나, 받은 값: "${type}")`
      })
      return
    }
    const presenter_names = [presenter1, presenter2].filter(Boolean)
    if (slot !== null && (!Number.isFinite(slot) || slot < 1)) {
      errors.push({ rowNum, message: 'slot 값이 잘못됐습니다' })
      return
    }
    parsed.push({
      rowNum,
      session_number,
      date,
      type,
      note,
      slot,
      presenter_names,
      company_name,
      cafe_url
    })
  })
  return { parsed, errors }
}

export function ImportForm({ quarter, members }: { quarter: Quarter; members: Member[] }) {
  const router = useRouter()
  const [parsed, setParsed] = useState<ParsedRow[]>([])
  const [parseErrors, setParseErrors] = useState<ParseError[]>([])
  const [unmatchedNames, setUnmatchedNames] = useState<string[]>([])
  const [pending, setPending] = useState(false)
  const [submitResult, setSubmitResult] = useState<ImportResult | null>(null)
  const [fileName, setFileName] = useState('')

  const memberNames = new Set(members.map(m => m.name))

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setSubmitResult(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      if (!ws) {
        setParseErrors([{ rowNum: 0, message: '시트를 읽을 수 없습니다' }])
        setParsed([])
        return
      }
      const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })
      const { parsed, errors } = parseRows(json)
      setParsed(parsed)
      setParseErrors(errors)
      const unmatched = new Set<string>()
      for (const r of parsed) {
        for (const n of r.presenter_names) {
          if (!memberNames.has(n)) unmatched.add(n)
        }
      }
      setUnmatchedNames(Array.from(unmatched))
    } catch (err) {
      setParseErrors([
        { rowNum: 0, message: err instanceof Error ? err.message : '파일 읽기 실패' }
      ])
      setParsed([])
    }
  }

  const handleSubmit = async () => {
    if (parsed.length === 0 || pending) return
    setPending(true)
    setSubmitResult(null)
    const r = await fetch('/api/admin/schedule/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        quarter_id: quarter.id,
        rows: parsed.map(p => ({
          session_number: p.session_number,
          date: p.date,
          type: p.type,
          note: p.note,
          slot: p.slot,
          presenter_names: p.presenter_names,
          company_name: p.company_name,
          cafe_url: p.cafe_url
        }))
      })
    })
    setPending(false)
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      alert(`등록 실패: ${j.error ?? r.statusText}`)
      return
    }
    const result = (await r.json()) as ImportResult
    setSubmitResult(result)
    router.refresh()
  }

  const sessionCount = new Set(parsed.map(p => p.session_number)).size
  const presentationCount = parsed.filter(p => p.slot !== null && p.presenter_names.length > 0).length

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
        <p>
          <strong>{quarter.name} 분기</strong>에 회차/발표를 일괄 등록합니다.
        </p>
        <p className="mt-1">엑셀 양식을 받으셔서 채우신 후 업로드하세요.</p>
      </div>

      <div>
        <Button variant="outline" onClick={downloadTemplate}>
          <Download className="h-5 w-5" />
          엑셀 템플릿 다운로드
        </Button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-3 text-base font-bold">엑셀 컬럼 안내</div>
        <ul className="space-y-1 text-sm text-gray-700">
          <li>
            <code>session_number</code>: 회차 번호 (1, 2, 3...)
          </li>
          <li>
            <code>date</code>: 날짜 (YYYY-MM-DD, 예: 2026-04-07)
          </li>
          <li>
            <code>type</code>: 유형 — normal(정상) / rest(휴강) / dinner(식사) / social(친목)
          </li>
          <li>
            <code>note</code>: 메모 (선택)
          </li>
          <li>
            <code>slot</code>: 발표 슬롯 번호 (1, 2... 발표 없는 회차는 빈칸)
          </li>
          <li>
            <code>presenter1</code>, <code>presenter2</code>: 발표자 이름 (멤버 명단의 이름과 정확히 일치)
          </li>
          <li>
            <code>company_name</code>: 발표 기업명 (선택)
          </li>
          <li>
            <code>cafe_url</code>: 카페 자료 링크 (선택)
          </li>
        </ul>
        <p className="mt-3 text-xs text-gray-500">
          한 회차에 발표가 여러 개면 같은 session_number/date를 가진 행을 슬롯별로 추가하세요.
        </p>
      </div>

      <div>
        <label className="block">
          <input type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
          <span className="flex h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-white text-base font-medium text-gray-700 hover:border-green-500 hover:bg-green-50">
            <Upload className="h-5 w-5" />
            {fileName || '엑셀 파일 선택 (.xlsx)'}
          </span>
        </label>
      </div>

      {parseErrors.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <div className="mb-2 flex items-center gap-1 font-bold">
            <AlertTriangle className="h-4 w-4" />
            엑셀 형식 오류 ({parseErrors.length}건)
          </div>
          <ul className="space-y-1">
            {parseErrors.slice(0, 10).map((e, i) => (
              <li key={i}>
                {e.rowNum > 0 ? `${e.rowNum}행: ` : ''}
                {e.message}
              </li>
            ))}
            {parseErrors.length > 10 && <li>... 외 {parseErrors.length - 10}건</li>}
          </ul>
        </div>
      )}

      {parsed.length > 0 && (
        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
          <div className="text-base font-bold">미리보기</div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-green-50 p-3">
              <div className="text-xs text-green-700">회차</div>
              <div className="text-2xl font-bold text-green-900">{sessionCount}개</div>
            </div>
            <div className="rounded-lg bg-blue-50 p-3">
              <div className="text-xs text-blue-700">발표</div>
              <div className="text-2xl font-bold text-blue-900">{presentationCount}개</div>
            </div>
          </div>

          {unmatchedNames.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <div className="flex items-center gap-1 font-bold">
                <AlertTriangle className="h-4 w-4" />
                매칭되지 않는 이름 ({unmatchedNames.length}개)
              </div>
              <p className="mt-1">멤버 명단에 없는 이름들입니다. 등록 시 해당 발표는 스킵됩니다.</p>
              <p className="mt-1 font-mono text-xs">{unmatchedNames.join(', ')}</p>
            </div>
          )}

          <div className="max-h-96 overflow-y-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-gray-50 text-left">
                <tr>
                  <th className="px-2 py-2">회차</th>
                  <th className="px-2 py-2">날짜</th>
                  <th className="px-2 py-2">유형</th>
                  <th className="px-2 py-2">슬롯</th>
                  <th className="px-2 py-2">발표자</th>
                  <th className="px-2 py-2">기업</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {parsed.map((r, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5">{r.session_number}</td>
                    <td className="px-2 py-1.5">{r.date}</td>
                    <td className="px-2 py-1.5">{SESSION_TYPE_LABEL[r.type]}</td>
                    <td className="px-2 py-1.5">{r.slot ?? '-'}</td>
                    <td className="px-2 py-1.5">{r.presenter_names.join(', ') || '-'}</td>
                    <td className="px-2 py-1.5">{r.company_name || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Button onClick={handleSubmit} disabled={pending} className="w-full">
            {pending ? '등록 중...' : `${quarter.name} 분기에 등록`}
          </Button>
        </div>
      )}

      {submitResult && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900">
          <div className="mb-2 flex items-center gap-1 font-bold">
            <CheckCircle2 className="h-5 w-5" />
            등록 완료
          </div>
          <ul className="space-y-1">
            <li>새 회차: {submitResult.created_sessions}개</li>
            <li>기존 회차 재사용: {submitResult.reused_sessions}개</li>
            <li>새 발표: {submitResult.created_presentations}개</li>
            {submitResult.skipped_presentations > 0 && (
              <li className="text-amber-800">
                중복으로 스킵된 발표: {submitResult.skipped_presentations}개
              </li>
            )}
            {submitResult.unmatched_names.length > 0 && (
              <li className="text-amber-800">
                매칭 안 된 이름: {submitResult.unmatched_names.join(', ')}
              </li>
            )}
            {submitResult.errors.length > 0 && (
              <li className="text-red-800">
                오류 {submitResult.errors.length}건:{' '}
                {submitResult.errors.slice(0, 3).map(e => e.message).join('; ')}
                {submitResult.errors.length > 3 && ' ...'}
              </li>
            )}
          </ul>
          <Button
            variant="outline"
            className="mt-3"
            onClick={() => router.push('/admin/schedule')}
          >
            분기 일정으로 돌아가기
          </Button>
        </div>
      )}
    </div>
  )
}
