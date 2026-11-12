import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-sans text-sm font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-fg text-bg hover:bg-fg/85',
        secondary: 'border border-border-strong bg-surface-2 text-fg hover:bg-surface-3',
        outline: 'border border-border-strong text-fg hover:bg-surface-2',
        ghost: 'text-muted hover:bg-surface-2 hover:text-fg',
        danger: 'border border-danger/40 bg-danger-soft text-danger hover:border-danger',
        link: 'text-fg underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-11 px-3.5 md:h-8 md:px-3 md:text-xs',
        md: 'h-11 px-4 md:h-10',
        lg: 'h-12 px-5 text-[15px]',
        icon: 'size-11 md:size-9',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

export function Button({ className, variant, size, asChild, loading, disabled, children, ...props }: ButtonProps) {
  if (asChild) {
    return (
      <Slot className={cn(buttonVariants({ variant, size }), className)} {...props}>
        {children}
      </Slot>
    )
  }
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  )
}
