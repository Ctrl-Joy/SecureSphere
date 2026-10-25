import { describe, expect, it } from 'vitest'
import { safeRedirect } from '@/lib/utils'
import { passwordChecks, passwordScore } from '@/lib/validation'

describe('safeRedirect (open-redirect protection)', () => {
  it.each([
    ['/settings', '/settings'],
    ['/admin/users?page=2', '/admin/users?page=2'],
    ['https://evil.example', '/dashboard'],
    ['//evil.example', '/dashboard'],
    ['/\\evil.example', '/dashboard'],
    ['javascript:alert(1)', '/dashboard'],
    [null, '/dashboard'],
  ])('%s -> %s', (input, expected) => {
    expect(safeRedirect(input)).toBe(expected)
  })
})

describe('password guidance', () => {
  it('flags passwords containing the email local part or name', () => {
    const checks = passwordChecks('alice-loves-cats-2026', 'alice@example.com', 'Alice Example')
    expect(checks.find((c) => c.label.includes('email'))?.ok).toBe(false)
    expect(checks.find((c) => c.label.includes('name'))?.ok).toBe(false)
  })

  it('scores long passphrases higher than short passwords', () => {
    expect(passwordScore('short')).toBe(0)
    expect(passwordScore('correct horse battery staple')).toBeGreaterThanOrEqual(3)
  })
})
