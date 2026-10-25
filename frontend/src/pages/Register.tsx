import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate } from 'react-router-dom'
import { z } from 'zod'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { PasswordStrength } from '@/components/PasswordStrength'
import { Button } from '@/components/ui/button'
import { Field, FormAlert, Input, PasswordInput } from '@/components/ui/form'
import { ApiError, post } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import type { Message } from '@/lib/types'
import { applyServerErrors, emailSchema, nameSchema, newPasswordSchema } from '@/lib/validation'

const schema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    password: newPasswordSchema,
    confirm: z.string().min(1, 'Confirm your password'),
    accept_terms: z.boolean().refine((v) => v, 'You must accept the terms to continue'),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' })
type Values = z.infer<typeof schema>

export function RegisterPage() {
  const { user } = useAuth()
  const [done, setDone] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', password: '', confirm: '', accept_terms: false },
    mode: 'onTouched',
  })
  const { errors, isSubmitting } = form.formState
  const [password, email, name] = form.watch(['password', 'email', 'name'])

  if (user) return <Navigate to="/dashboard" replace />

  const onSubmit = form.handleSubmit(async ({ confirm: _confirm, ...values }) => {
    setFormError(null)
    try {
      const res = await post<Message>('/auth/register', { ...values, accept_terms: true })
      setDone(res.message)
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) {
        setFormError('Too many registration attempts from your network. Please try again later.')
        return
      }
      setFormError(applyServerErrors(e, form.setError, ['name', 'email', 'password']))
    }
  })

  if (done) {
    return (
      <AuthLayout eyebrow="Registration" title="Registration received">
        <div className="space-y-6">
          <div className="flex gap-3 border border-ok/40 bg-ok/10 p-4">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok" aria-hidden />
            <p className="text-sm text-fg">{done}</p>
          </div>
          <p className="text-xs text-subtle">
            For privacy, we show the same message whether or not the email was already registered.
          </p>
          <Button asChild size="lg" className="w-full">
            <Link to="/login">
              Continue to sign in
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      eyebrow="Create account"
      title="Secure your workspace"
      description="Create an account to access the dashboard and security lab."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="text-fg underline underline-offset-4 hover:text-accent">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {formError ? <FormAlert>{formError}</FormAlert> : null}
        <Field label="Full name" error={errors.name?.message}>
          {(p) => <Input {...p} autoComplete="name" autoFocus {...form.register('name')} />}
        </Field>
        <Field label="Email" error={errors.email?.message}>
          {(p) => <Input {...p} type="email" autoComplete="email" {...form.register('email')} />}
        </Field>
        <Field
          label="Password"
          error={errors.password?.message}
          hint={<PasswordStrength password={password} email={email} name={name} />}
        >
          {(p) => <PasswordInput {...p} autoComplete="new-password" {...form.register('password')} />}
        </Field>
        <Field label="Confirm password" error={errors.confirm?.message}>
          {(p) => <PasswordInput {...p} autoComplete="new-password" {...form.register('confirm')} />}
        </Field>
        <div className="space-y-1.5">
          <label className="flex items-start gap-2.5 text-sm text-muted">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--accent)]"
              aria-invalid={Boolean(errors.accept_terms)}
              {...form.register('accept_terms')}
            />
            <span>
              I accept the terms of use and understand that security events on my account are logged for protection.
            </span>
          </label>
          {errors.accept_terms ? (
            <p role="alert" className="text-xs text-accent">
              {errors.accept_terms.message}
            </p>
          ) : null}
        </div>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Create account
          {!isSubmitting ? <ArrowRight /> : null}
        </Button>
      </form>
    </AuthLayout>
  )
}
