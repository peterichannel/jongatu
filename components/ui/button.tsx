import { ButtonHTMLAttributes, forwardRef } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-bold transition disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98]',
  {
    variants: {
      variant: {
        primary: 'bg-green-600 text-white hover:bg-green-700',
        danger: 'bg-red-600 text-white hover:bg-red-700',
        secondary: 'bg-gray-100 text-gray-900 border border-gray-300 hover:bg-gray-200',
        ghost: 'text-gray-700 hover:bg-gray-100',
        outline: 'bg-white text-gray-900 border border-gray-300 hover:bg-gray-50'
      },
      size: {
        default: 'h-14 px-5 text-lg',
        lg: 'h-16 px-6 text-xl',
        sm: 'h-10 px-3 text-sm'
      }
    },
    defaultVariants: { variant: 'primary', size: 'default' }
  }
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
)
Button.displayName = 'Button'
