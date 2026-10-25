import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { PasswordStrength } from '@/components/PasswordStrength'
import { Button } from '@/components/ui/button'
import { Field, FormAlert, Input, PasswordInput } from '@/components/ui/form'
import { ApiError, post } from '@/lib/api'
import type { Message } from '@/lib/types'
import { applyServerErrors, emailSchema, newPasswordSchema } from '@/lib/validation'

const requestSchema = z.object({ email: emailSchema })

export function ForgotPasswordPage() {
  const [sent, setSent] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const form = useForm<z.infer<typeof requestSchema>>({ resolver: zodResolver(requestSchema), defaultValues: { email: '' } })

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null)
    try {
      const res = await post<Message>('/auth/password-reset/request', values)
      setSent(res.message)
    } catch (e) {
      setError(e instanceof ApiError && e.status === 429 ? 'Too many requests. Please try again later.' : 'Request failed. Please try again.')
    }
  })

  return (
    <AuthLayout
      eyebrow="Account recovery"
      title="Reset your password"
      description="Enter your email and we will send a single-use link that expires in 30 minutes."
      footer={
        <Link to="/login" className="text-fg underline underline-offset-4 hover:text-accent">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <div className="space-y-4">
          <FormAlert tone="success">{sent}</FormAlert>
          {import.meta.env.DEV ? (
            <FormAlert tone="info">
              Development mode: emails are written to <code className="font-mono text-fg">backend/var/dev_mail/</code>{' '}
              instead of being sent.
            </FormAlert>
          ) : null}
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          {error ? <FormAlert>{error}</FormAlert> : null}
          <Field label="Email" error={form.formState.errors.email?.message}>
            {(p) => <Input {...p} type="email" autoComplete="email" autoFocus {...form.register('email')} />}
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}

const resetSchema = z
  .object({ new_password: newPasswordSchema, confirm: z.string().min(1, 'Confirm your password') })
  .refine((v) => v.new_password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })

export function ResetPasswordPage() {
  const navigate = useNavigate()
  // The token travels in the URL fragment, which browsers never send to servers or in
  // Referer headers. It is removed from the address bar as soon as it has been read.
  const [token] = useState<string | null>(() => /token=([A-Za-z0-9_-]+)/.exec(window.location.hash)?.[1] ?? null)
  const [error, setError] = useState<string | null>(null)
  const form = useForm<z.infer<typeof resetSchema>>({
    resolver: zodResolver(resetSchema),
    defaultValues: { new_password: '', confirm: '' },
  })

  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname)
  }, [])

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null)
    try {
      await post<Message>('/auth/password-reset/confirm', { token, new_password: values.new_password })
      navigate('/login?reset=1', { replace: true })
    } catch (e) {
      setError(applyServerErrors(e, form.setError, ['new_password']))
    }
  })

  return (
    <AuthLayout
      eyebrow="Account recovery"
      title="Choose a new password"
      description="All existing sessions will be signed out after the change."
      footer={
        <Link to="/forgot-password" className="text-fg underline underline-offset-4 hover:text-accent">
          Request a new link
        </Link>
      }
    >
      {token === null ? (
        <FormAlert>This reset link is missing its token. Request a new link to continue.</FormAlert>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-5">
          {error ? <FormAlert>{error}</FormAlert> : null}
          <Field
            label="New password"
            error={form.formState.errors.new_password?.message}
            hint={<PasswordStrength password={form.watch('new_password')} />}
          >
            {(p) => <PasswordInput {...p} autoComplete="new-password" autoFocus {...form.register('new_password')} />}
          </Field>
          <Field label="Confirm password" error={form.formState.errors.confirm?.message}>
            {(p) => <PasswordInput {...p} autoComplete="new-password" {...form.register('confirm')} />}
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={form.formState.isSubmitting}>
            Update password
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
