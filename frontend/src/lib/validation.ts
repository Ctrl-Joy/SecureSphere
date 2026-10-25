import { z } from 'zod'
import type { UseFormSetError, FieldValues, Path } from 'react-hook-form'
import { ApiError } from './api'

export const PASSWORD_MIN = 12
export const PASSWORD_MAX = 128

export const emailSchema = z.string().trim().min(1, 'Email is required').max(254).pipe(z.email('Enter a valid email address'))

export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters`)
  .max(PASSWORD_MAX, `Use at most ${PASSWORD_MAX} characters`)

export const nameSchema = z
  .string()
  .trim()
  .min(1, 'Name is required')
  .max(100, 'Use at most 100 characters')

/** Client-side mirror of the server policy, used only for guidance. The server decides. */
export function passwordChecks(password: string, email = '', name = '') {
  const lower = password.toLowerCase()
  const local = email.split('@')[0]?.toLowerCase() ?? ''
  return [
    { label: `At least ${PASSWORD_MIN} characters`, ok: password.length >= PASSWORD_MIN },
    { label: 'Varied characters (5+ distinct)', ok: new Set(password).size >= 5 },
    { label: 'Does not contain your email', ok: !(local.length >= 4 && lower.includes(local)) },
    {
      label: 'Does not contain your name',
      ok: !name
        .toLowerCase()
        .split(/\s+/)
        .some((part) => part.length >= 4 && lower.includes(part)),
    },
  ]
}

export function passwordScore(password: string) {
  if (!password) return 0
  let score = 0
  if (password.length >= PASSWORD_MIN) score++
  if (password.length >= 16) score++
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length
  if (classes >= 3) score++
  if (password.length >= 20 || (password.includes(' ') && password.length >= 16)) score++
  return Math.min(4, score)
}

/** Maps server field errors onto react-hook-form fields; returns the top-level message. */
export function applyServerErrors<T extends FieldValues>(error: unknown, setError: UseFormSetError<T>, known: Path<T>[]) {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.'
  let unmapped = false
  for (const f of error.fields) {
    if ((known as string[]).includes(f.field)) {
      setError(f.field as Path<T>, { type: 'server', message: f.message })
    } else {
      unmapped = true
    }
  }
  return error.fields.length && !unmapped ? null : error.message
}
