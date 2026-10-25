import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { z } from 'zod'
import { AuthLayout } from '@/components/layout/AuthLayout'
import { Button } from '@/components/ui/button'
import { Field, FormAlert, Input, PasswordInput } from '@/components/ui/form'
import { ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { safeRedirect } from '@/lib/utils'
import { emailSchema, PASSWORD_MAX } from '@/lib/validation'

const schema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(PASSWORD_MAX),
})
type Values = z.infer<typeof schema>

export function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeRedirect(params.get('next'))
  const [formError, setFormError] = useState<string | null>(null)
  const notice = params.get('reset') === '1' ? 'Password updated. Sign in with your new password.' : null

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } })
  const { errors, isSubmitting } = form.formState

  if (user) return <Navigate to={next} replace />

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null)
    try {
      await login(values.email, values.password)
      navigate(next, { replace: true })
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) {
        setFormError('Too many sign-in attempts. Please wait a few minutes and try again.')
      } else if (e instanceof ApiError && e.status === 401) {
        // Deliberately generic: never reveal whether the account exists or is locked.
        setFormError('Invalid email or password.')
      } else {
        setFormError(e instanceof Error ? e.message : 'Sign-in failed.')
      }
      form.resetField('password')
    }
  })

  return (
    <AuthLayout
      eyebrow="Sign in"
      title="Welcome back"
      description="Access your security console."
      footer={
        <>
          New to SecureSphere?{' '}
          <Link to="/register" className="text-fg underline underline-offset-4 hover:text-accent">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {notice ? <FormAlert tone="success">{notice}</FormAlert> : null}
        {formError ? <FormAlert>{formError}</FormAlert> : null}
        <Field label="Email" error={errors.email?.message}>
          {(p) => <Input {...p} type="email" autoComplete="username" autoFocus {...form.register('email')} />}
        </Field>
        <Field label="Password" error={errors.password?.message}>
          {(p) => <PasswordInput {...p} autoComplete="current-password" {...form.register('password')} />}
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-xs text-muted underline-offset-4 hover:text-fg hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Sign in
          {!isSubmitting ? <ArrowRight /> : null}
        </Button>
      </form>
    </AuthLayout>
  )
}
