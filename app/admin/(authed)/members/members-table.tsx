'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, UserPlus, X, Check, KeyRound, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type MemberRow = {
  id: string
  name: string
  joined_at: string
  is_active: boolean
  created_at: string
  has_pin: boolean
  is_admin: boolean
  has_recovery: boolean
}

export function MembersTable({ members }: { members: MemberRow[] }) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const refresh = () => router.refresh()

  const handleAdd = async () => {
    const trimmed = name.trim()
    if (!trimmed || pending) return
    setPending(true)
    const r = await fetch('/api/admin/members', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: trimmed })
    })
    setPending(false)
    if (r.ok) {
      setName('')
      setAdding(false)
      refresh()
    } else {
      alert('추가 실패')
    }
  }

  const handleUpdate = async (id: string) => {
    const trimmed = editingName.trim()
    if (!trimmed) return
    const r = await fetch(`/api/admin/members/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: trimmed })
    })
    if (r.ok) {
      setEditingId(null)
      refresh()
    }
  }

  const handleToggleActive = async (m: MemberRow) => {
    await fetch(`/api/admin/members/${m.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ is_active: !m.is_active })
    })
    refresh()
  }

  const handleResetPin = async (m: MemberRow) => {
    if (!confirm(`${m.name}님의 PIN을 초기화하시겠습니까?\n해당 멤버는 다음 접속 시 PIN을 새로 설정해야 합니다.`)) return
    const r = await fetch(`/api/admin/members/${m.id}/reset-pin`, { method: 'POST' })
    if (r.ok) refresh()
    else alert('초기화 실패')
  }

  const handleToggleAdmin = async (m: MemberRow) => {
    const next = !m.is_admin
    if (
      !confirm(
        next
          ? `${m.name}님에게 운영자 권한을 부여하시겠습니까?\n(멤버/일정/평가/정산 관리 가능)`
          : `${m.name}님의 운영자 권한을 회수하시겠습니까?`
      )
    )
      return
    const r = await fetch(`/api/admin/members/${m.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ is_admin: next })
    })
    if (r.ok) refresh()
    else alert('변경 실패')
  }

  const activeCount = members.filter(m => m.is_active).length

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-900">
        활성 스터디원 <strong>{activeCount}명</strong> / 전체 {members.length}명
      </div>

      {!adding ? (
        <Button onClick={() => setAdding(true)} className="w-full">
          <UserPlus className="h-5 w-5" />
          스터디원 추가
        </Button>
      ) : (
        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
          <Label htmlFor="new-name">이름</Label>
          <Input
            id="new-name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="홍길동"
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter') handleAdd()
            }}
          />
          <p className="text-xs text-gray-500">
            PIN과 본인 확인 답변(어머니 성함)은 멤버 본인이 첫 접속 시 직접 설정합니다.
          </p>
          <div className="flex gap-2">
            <Button onClick={handleAdd} className="flex-1" disabled={!name.trim() || pending}>
              {pending ? '추가 중...' : '추가'}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setAdding(false)
                setName('')
              }}
              className="flex-1"
            >
              취소
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {members.length === 0 ? (
          <p className="p-6 text-center text-gray-500">아직 스터디원이 없습니다.</p>
        ) : (
          <ul className="divide-y divide-gray-200">
            {members.map(m => (
              <li
                key={m.id}
                className={`flex items-center gap-2 p-4 ${!m.is_active ? 'bg-gray-50 opacity-60' : ''}`}
              >
                {editingId === m.id ? (
                  <>
                    <Input
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
                      className="flex-1"
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') handleUpdate(m.id) }}
                    />
                    <Button size="sm" onClick={() => handleUpdate(m.id)}><Check className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></Button>
                  </>
                ) : (
                  <>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-lg font-medium text-gray-900">{m.name}</span>
                        {m.is_admin && (
                          <span
                            title="운영자 권한"
                            className="inline-flex items-center gap-0.5 rounded-full bg-gray-900 px-2 py-0.5 text-xs font-semibold text-white"
                          >
                            <ShieldCheck className="h-3 w-3" /> 운영자
                          </span>
                        )}
                        {m.has_pin ? (
                          <span
                            title="PIN 설정됨"
                            className="inline-flex items-center gap-0.5 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800"
                          >
                            PIN
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">
                            PIN 미설정
                          </span>
                        )}
                        {m.has_recovery && (
                          <span
                            title="본인 확인 답변(어머니 성함) 설정됨"
                            className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800"
                          >
                            본인확인
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">
                        가입 {m.joined_at}
                        {!m.is_active && ' · 비활성'}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setEditingId(m.id); setEditingName(m.name) }}
                      aria-label="이름 수정"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleToggleAdmin(m)}
                      aria-label={m.is_admin ? '운영자 권한 회수' : '운영자 권한 부여'}
                      title={m.is_admin ? '운영자 권한 회수' : '운영자 권한 부여'}
                    >
                      <ShieldCheck
                        className={`h-4 w-4 ${m.is_admin ? 'text-gray-900' : 'text-gray-300'}`}
                      />
                    </Button>
                    {m.has_pin && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleResetPin(m)}
                        aria-label="PIN 초기화"
                        title="PIN 초기화"
                      >
                        <KeyRound className="h-4 w-4 text-amber-600" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant={m.is_active ? 'outline' : 'primary'}
                      onClick={() => handleToggleActive(m)}
                    >
                      {m.is_active ? '비활성화' : '활성화'}
                    </Button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
