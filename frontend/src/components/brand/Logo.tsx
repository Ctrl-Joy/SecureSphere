import { cn } from '@/lib/utils'

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} aria-hidden fill="none">
      <g stroke="currentColor" strokeWidth="1.5" strokeLinecap="square">
        <path d="M16 3v26M3 16h26" />
        <path d="M6.8 6.8l18.4 18.4M25.2 6.8L6.8 25.2" />
      </g>
      <path d="M16 10.5l5.5 5.5-5.5 5.5-5.5-5.5z" fill="var(--bg)" stroke="currentColor" strokeWidth="1.5" />
      <path d="M16 13.6l2.4 2.4-2.4 2.4-2.4-2.4z" fill="var(--accent)" />
    </svg>
  )
}

export function Logo({ className, withWordmark = true }: { className?: string; withWordmark?: boolean }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5 text-fg', className)}>
      <LogoMark />
      {withWordmark ? (
        <span className="font-mono text-[13px] font-medium uppercase tracking-[0.2em]">SecureSphere</span>
      ) : (
        <span className="sr-only">SecureSphere</span>
      )}
    </span>
  )
}
