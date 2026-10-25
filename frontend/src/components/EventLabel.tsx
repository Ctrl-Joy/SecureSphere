const LABELS: Record<string, string> = {
  'auth.register': 'Account registered',
  'auth.register.duplicate': 'Registration with existing email',
  'auth.login.success': 'Signed in',
  'auth.login.failure': 'Failed sign-in',
  'auth.login.blocked': 'Sign-in blocked',
  'auth.lockout': 'Account temporarily locked',
  'auth.logout': 'Signed out',
  'auth.password_change': 'Password changed',
  'auth.password_change.failure': 'Password change rejected',
  'auth.password_reset.request': 'Password reset requested',
  'auth.password_reset.complete': 'Password reset completed',
  'auth.password_reset.failure': 'Invalid reset link used',
  'session.revoke': 'Session revoked',
  'session.revoke_others': 'Other sessions signed out',
  'profile.update': 'Profile updated',
  'admin.user.update': 'User role or status changed',
  'admin.user.unlock': 'Account unlocked by admin',
  'authz.denied': 'Access denied',
  'rate_limit.exceeded': 'Rate limit exceeded',
  'cli.admin.create': 'Administrator provisioned (CLI)',
}

export function eventLabel(type: string) {
  return LABELS[type] ?? type
}
