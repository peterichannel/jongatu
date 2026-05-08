'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function PrintButton() {
  return (
    <Button onClick={() => window.print()} variant="primary" size="sm">
      <Printer className="h-4 w-4" />
      인쇄 / PDF 저장
    </Button>
  )
}
