import { Eye, EyeOff } from 'lucide-react'
import { useId, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

const inputBase =
  'h-10 w-full border border-border-strong bg-surface px-3 text-sm text-fg placeholder:text-subtle transition-colors hover:border-subtle focus-visible:border-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent aria-[invalid=true]:border-accent disabled:opacity-60'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputBase, className)} {...props} />
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(inputBase, 'appearance-auto pr-2', className)} {...props}>
      {children}
    </select>
  )
}

interface FieldProps {
  label: string
  error?: string
  hint?: ReactNode
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode
  className?: string
}

/** Accessible label + control + error wiring. */
export function Field({ label, error, hint, children, className }: FieldProps) {
  const id = useId()
  const errId = `${id}-err`
  const hintId = `${id}-hint`
  const describedBy = [error ? errId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className="block font-mono text-xs uppercase tracking-wider text-muted">
        {label}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {hint ? (
        <div id={hintId} className="text-xs text-subtle">
          {hint}
        </div>
      ) : null}
      {error ? (
        <p id={errId} role="alert" className="text-xs text-accent">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className="pr-11" />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-subtle hover:text-fg"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

export function FormAlert({ children, tone = 'error' }: { children: ReactNode; tone?: 'error' | 'success' | 'info' }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'border px-3 py-2.5 text-sm',
        tone === 'error' && 'border-accent/40 bg-accent-soft text-fg',
        tone === 'success' && 'border-ok/40 bg-ok/10 text-fg',
        tone === 'info' && 'border-border-strong bg-surface-2 text-muted',
      )}
    >
      {children}
    </div>
  )
}
