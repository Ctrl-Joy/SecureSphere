import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { RequireAdmin, RequireAuth } from '@/components/RouteGuards'
import { api, ApiError, setCsrfToken } from '@/lib/api'
import { LoginPage } from '@/pages/Login'
import { RegisterPage } from '@/pages/Register'
import { alice, me, mockFetch, renderApp, unauthenticated } from './utils'

describe('LoginPage', () => {
  it('validates fields on the client before calling the API', async () => {
    const f = mockFetch(unauthenticated)
    renderApp(<LoginPage />, { route: '/login', path: '/login' })
    await userEvent.click(await screen.findByRole('button', { name: /sign in/i }))
    expect(await screen.findByText('Email is required')).toBeInTheDocument()
    expect(screen.getByText('Password is required')).toBeInTheDocument()
    expect(f.calls.some((c) => c.url.endsWith('/auth/login'))).toBe(false)
  })

  it('shows a generic message on bad credentials and clears the password', async () => {
    mockFetch((url) =>
      url.endsWith('/auth/login')
        ? { status: 401, body: { error: { code: 'invalid_credentials', message: 'Invalid email or password.' } } }
        : unauthenticated(url, {}),
    )
    renderApp(<LoginPage />, { route: '/login', path: '/login' })
    await userEvent.type(await screen.findByLabelText('Email'), 'alice@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password.')
    expect(screen.getByLabelText('Password')).toHaveValue('')
  })

  it('sends the CSRF header, then follows only a safe ?next redirect', async () => {
    const f = mockFetch((url) => (url.endsWith('/auth/login') ? { status: 200, body: me() } : unauthenticated(url, {})))
    renderApp(<LoginPage />, { route: '/login?next=//evil.example', path: '/login' })
    await userEvent.type(await screen.findByLabelText('Email'), 'alice@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'a-good-password-123')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/dashboard'))
    const login = f.calls.find((c) => c.url.endsWith('/auth/login'))!
    expect((login.init.headers as Record<string, string>)['X-CSRF-Token']).toBe('csrf-anon-token')
    expect(login.init.credentials).toBe('include')
  })

  it('shows the password with the toggle for accessibility', async () => {
    mockFetch(unauthenticated)
    renderApp(<LoginPage />, { route: '/login', path: '/login' })
    const input = await screen.findByLabelText('Password')
    expect(input).toHaveAttribute('type', 'password')
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(input).toHaveAttribute('type', 'text')
  })
})

describe('RegisterPage', () => {
  it('requires matching passwords and accepted terms', async () => {
    mockFetch(unauthenticated)
    renderApp(<RegisterPage />, { route: '/register', path: '/register' })
    await userEvent.type(await screen.findByLabelText('Full name'), 'Bob Builder')
    await userEvent.type(screen.getByLabelText('Email'), 'bob@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'a-long-pass-phrase-1')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'something-else-entirely')
    await userEvent.click(screen.getByRole('button', { name: /create account/i }))
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument()
    expect(screen.getByText('You must accept the terms to continue')).toBeInTheDocument()
  })

  it('maps server-side policy errors onto the password field', async () => {
    mockFetch((url) =>
      url.endsWith('/auth/register')
        ? {
            status: 422,
            body: {
              error: {
                code: 'weak_password',
                message: 'Password does not meet the policy.',
                fields: [{ field: 'password', message: 'This password is too common.' }],
              },
            },
          }
        : unauthenticated(url, {}),
    )
    renderApp(<RegisterPage />, { route: '/register', path: '/register' })
    await userEvent.type(await screen.findByLabelText('Full name'), 'Bob Builder')
    await userEvent.type(screen.getByLabelText('Email'), 'bob@example.com')
    await userEvent.type(screen.getByLabelText('Password'), 'password1234')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'password1234')
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: /create account/i }))
    expect(await screen.findByText('This password is too common.')).toBeInTheDocument()
  })
})

describe('route guards', () => {
  it('redirects anonymous visitors to login with a return path', async () => {
    mockFetch(unauthenticated)
    renderApp(
      <RequireAuth>
        <div>Secret settings</div>
      </RequireAuth>,
      { route: '/settings', path: '/settings' },
    )
    await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('/login?next=%2Fsettings'))
    expect(screen.queryByText('Secret settings')).not.toBeInTheDocument()
  })

  it('shows protected content to signed-in users', async () => {
    mockFetch((url) => (url.endsWith('/auth/me') ? { status: 200, body: me() } : { status: 404 }))
    renderApp(
      <RequireAuth>
        <div>Secret settings</div>
      </RequireAuth>,
      { route: '/settings', path: '/settings' },
    )
    expect(await screen.findByText('Secret settings')).toBeInTheDocument()
  })

  it('hides admin screens from regular users', async () => {
    mockFetch((url) => (url.endsWith('/auth/me') ? { status: 200, body: me(alice) } : { status: 404 }))
    renderApp(
      <RequireAuth>
        <RequireAdmin>
          <div>User table</div>
        </RequireAdmin>
      </RequireAuth>,
      { route: '/admin/users', path: '/admin/users' },
    )
    expect(await screen.findByText('Administrator access required')).toBeInTheDocument()
    expect(screen.queryByText('User table')).not.toBeInTheDocument()
  })

  it('shows admin screens to administrators', async () => {
    mockFetch((url) => (url.endsWith('/auth/me') ? { status: 200, body: me({ ...alice, role: 'admin' }) } : { status: 404 }))
    renderApp(
      <RequireAuth>
        <RequireAdmin>
          <div>User table</div>
        </RequireAdmin>
      </RequireAuth>,
      { route: '/admin/users', path: '/admin/users' },
    )
    expect(await screen.findByText('User table')).toBeInTheDocument()
  })
})

describe('api client', () => {
  it('refreshes the CSRF token and retries once after csrf_failed', async () => {
    let attempts = 0
    const f = mockFetch((url) => {
      if (url.endsWith('/profile')) {
        attempts++
        return attempts === 1
          ? { status: 403, body: { error: { code: 'csrf_failed', message: 'bad token' } } }
          : { status: 200, body: { ok: true } }
      }
      return { status: 404 }
    })
    setCsrfToken('stale-token')
    await expect(api('/profile', { method: 'PATCH', body: { name: 'x' } })).resolves.toEqual({ ok: true })
    const headers = f.calls.filter((c) => c.url.endsWith('/profile')).map((c) => (c.init.headers as Record<string, string>)['X-CSRF-Token'])
    expect(headers).toEqual(['stale-token', 'csrf-anon-token'])
  })

  it('surfaces structured errors with field details', async () => {
    mockFetch(() => ({
      status: 422,
      body: { error: { code: 'validation_error', message: 'Some fields are invalid.', fields: [{ field: 'name', message: 'Required' }] } },
    }))
    const err = await api('/profile').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).fields).toEqual([{ field: 'name', message: 'Required' }])
  })
})
