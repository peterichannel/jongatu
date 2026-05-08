import { InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-14 w-full rounded-xl border border-gray-300 bg-white px-4 text-lg outline-none transition focus:border-green-600 focus:ring-2 focus:ring-green-100 disabled:opacity-40',
        className
      )}
      {...props}
    />
  )
)
Input.displayName = 'Input'
