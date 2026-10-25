import { Check, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { passwordChecks, passwordScore } from '@/lib/validation'

const LABELS = ['Too short', 'Weak', 'Fair', 'Strong', 'Very strong']

export function PasswordStrength({ password, email, name }: { password: string; email?: string; name?: string }) {
  const score = passwordScore(password)
  const checks = passwordChecks(password, email, name)
  return (
    <div className="space-y-2.5" aria-live="polite">
      <div className="flex items-center gap-3">
        <div className="grid flex-1 grid-cols-4 gap-1" aria-hidden>
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={cn(
                'h-1 transition-colors',
                i <= score ? (score <= 1 ? 'bg-accent' : score === 2 ? 'bg-warn' : 'bg-ok') : 'bg-surface-3',
              )}
            />
          ))}
        </div>
        <span className="w-20 text-right font-mono text-[11px] text-muted">{password ? LABELS[score] : ''}</span>
      </div>
      <ul className="grid gap-1 sm:grid-cols-2">
        {checks.map((c) => (
          <li key={c.label} className={cn('flex items-center gap-1.5 text-xs', c.ok && password ? 'text-fg' : 'text-subtle')}>
            {c.ok && password ? <Check className="size-3 text-ok" aria-hidden /> : <Minus className="size-3" aria-hidden />}
            {c.label}
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-subtle">Tip: a passphrase of several random words is long and memorable.</p>
    </div>
  )
}
