import { Link } from 'react-router-dom'
import { Logo } from '@/components/brand/Logo'

const COLUMNS = [
  {
    title: 'Product',
    links: [
      { label: 'Create account', href: '/register' },
      { label: 'Sign in', href: '/login' },
      { label: 'Security lab', href: '/lab' },
    ],
  },
  {
    title: 'Documentation',
    links: [
      { label: 'Architecture', href: '/#architecture' },
      { label: 'Feature overview', href: '/#features' },
      { label: 'API reference', href: '/api/docs' },
    ],
  },
  {
    title: 'Project',
    links: [
      { label: 'README & threat model', href: '/#contact' },
      { label: 'Reset password', href: '/forgot-password' },
    ],
  },
]

export function Footer() {
  return (
    <footer id="contact" className="border-t border-border bg-bg">
      <div className="mx-auto grid max-w-[1400px] gap-12 px-4 py-14 sm:px-8 md:grid-cols-[1.4fr_repeat(3,1fr)] lg:px-12">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-4 font-mono text-[13px] leading-relaxed text-muted">
            A full-stack reference application for secure software development: authentication, access
            control, monitoring and security testing, built in the open.
          </p>
          <p className="mt-6 font-mono text-xs text-subtle">
            Found a vulnerability? Follow the disclosure steps in <span className="text-fg">SECURITY.md</span> in the
            project repository. Please do not open public issues for security reports.
          </p>
        </div>
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h3 className="font-mono text-xs uppercase tracking-[0.18em] text-subtle">{col.title}</h3>
            <ul className="mt-4 space-y-2.5">
              {col.links.map((l) => (
                <li key={l.label}>
                  {l.href.startsWith('/api') || l.href.includes('#') ? (
                    <a href={l.href} className="text-sm text-muted hover:text-fg">
                      {l.label}
                    </a>
                  ) : (
                    <Link to={l.href} className="text-sm text-muted hover:text-fg">
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-[1400px] flex-col justify-between gap-2 px-4 py-5 font-mono text-xs text-subtle sm:flex-row sm:px-8 lg:px-12">
          <span>© {new Date().getFullYear()} SecureSphere. Educational project.</span>
          <span>FastAPI · PostgreSQL · React</span>
        </div>
      </div>
    </footer>
  )
}
