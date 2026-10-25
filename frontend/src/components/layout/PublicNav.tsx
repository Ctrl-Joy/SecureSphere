import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { ArrowRight, ChevronDown, Menu, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/brand/Logo'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'

type NavItem = { label: string; href: string; description?: string }

const RESOURCES: NavItem[] = [
  { label: 'Security lab', href: '/lab', description: 'Interactive vulnerability demos' },
  { label: 'Architecture', href: '/#architecture', description: 'How a request is protected' },
  { label: 'API reference', href: '/api/docs', description: 'OpenAPI docs (development)' },
]

const BENEFITS: NavItem[] = [
  { label: 'Authentication', href: '/#features', description: 'Argon2id + server sessions' },
  { label: 'Access control', href: '/#features', description: 'Deny-by-default RBAC' },
  { label: 'Monitoring', href: '/#features', description: 'Append-only audit trail' },
  { label: 'Security testing', href: '/#features', description: 'Automated attack tests' },
]

const navLink = 'font-mono text-[13px] tracking-wide text-fg/85 transition-colors hover:text-fg'

function NavHref({ item, className, children }: { item: NavItem; className?: string; children: React.ReactNode }) {
  // /api/docs is served by the backend, so use a plain anchor for it.
  if (item.href.startsWith('/api/') || item.href.includes('#')) {
    return (
      <a href={item.href} className={className}>
        {children}
      </a>
    )
  }
  return (
    <Link to={item.href} className={className}>
      {children}
    </Link>
  )
}

function NavDropdown({ label, items }: { label: string; items: NavItem[] }) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger className={cn(navLink, 'group inline-flex items-center gap-1.5 outline-none data-[state=open]:text-fg')}>
        {label}
        <ChevronDown className="size-3.5 transition-transform group-data-[state=open]:rotate-180" aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={14}
          align="start"
          className="z-50 w-64 border border-border-strong bg-surface p-1.5 shadow-2xl"
        >
          {items.map((item) => (
            <DropdownMenu.Item key={item.label} asChild>
              <NavHref
                item={item}
                className="block px-3 py-2.5 outline-none data-[highlighted]:bg-surface-2"
              >
                <span className="block text-sm text-fg">{item.label}</span>
                {item.description ? <span className="block text-xs text-subtle">{item.description}</span> : null}
              </NavHref>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export function PublicNav() {
  const { user } = useAuth()
  const cta = user ? { to: '/dashboard', label: 'Open console' } : { to: '/register', label: 'Secure system' }

  return (
    <header className="absolute inset-x-0 top-0 z-40">
      <div className="mx-auto flex h-[72px] max-w-[1400px] items-center justify-between px-4 sm:px-8 lg:px-12">
        <Link to="/" aria-label="SecureSphere home" className="shrink-0">
          <Logo withWordmark={false} className="[&_svg]:size-9" />
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-10 md:flex">
          <Link to="/" className={navLink}>
            Home
          </Link>
          <NavDropdown label="Resources" items={RESOURCES} />
          <NavDropdown label="Benefits" items={BENEFITS} />
          <a href="#contact" className={navLink}>
            Contact
          </a>
        </nav>

        <div className="flex items-center gap-2">
          {!user ? (
            <Link to="/login" className={cn(navLink, 'mr-3 hidden lg:inline')}>
              Sign in
            </Link>
          ) : null}
          <Button asChild className="hidden h-11 px-4 sm:inline-flex">
            <Link to={cta.to}>
              {cta.label}
              <ArrowRight />
            </Link>
          </Button>
          <MobileMenu ctaTo={cta.to} ctaLabel={cta.label} signedIn={Boolean(user)} />
        </div>
      </div>
    </header>
  )
}

function MobileMenu({ ctaTo, ctaLabel, signedIn }: { ctaTo: string; ctaLabel: string; signedIn: boolean }) {
  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
          <Menu />
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70" />
        <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex w-[min(320px,85vw)] flex-col border-l border-border-strong bg-bg p-5">
          <div className="mb-8 flex items-center justify-between">
            <DialogPrimitive.Title asChild>
              <span>
                <Logo />
              </span>
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">Site navigation</DialogPrimitive.Description>
            <DialogPrimitive.Close aria-label="Close menu" className="text-muted hover:text-fg">
              <X className="size-5" />
            </DialogPrimitive.Close>
          </div>
          <nav aria-label="Mobile" className="flex flex-col gap-1">
            {[{ label: 'Home', href: '/' }, ...RESOURCES, ...BENEFITS.slice(0, 1), { label: 'Contact', href: '#contact' }].map(
              (item) => (
                <DialogPrimitive.Close asChild key={item.label}>
                  <NavHref item={item} className="border-b border-border py-3 font-mono text-sm text-fg">
                    {item.label}
                  </NavHref>
                </DialogPrimitive.Close>
              ),
            )}
          </nav>
          <div className="mt-auto flex flex-col gap-2">
            {!signedIn ? (
              <Button asChild variant="outline">
                <Link to="/login">Sign in</Link>
              </Button>
            ) : null}
            <Button asChild>
              <Link to={ctaTo}>
                {ctaLabel}
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
