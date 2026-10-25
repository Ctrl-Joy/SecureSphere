export type Role = 'user' | 'admin'
export type AccountStatus = 'active' | 'suspended'
export type Severity = 'info' | 'low' | 'medium' | 'high'

export interface User {
  id: string
  name: string
  email: string
  role: Role
  status: AccountStatus
  created_at: string
  last_login_at: string | null
  password_changed_at: string
}

export interface AdminUser extends User {
  failed_login_count: number
  locked_until: string | null
  active_sessions: number
}

export interface MeResponse {
  user: User
  csrf_token: string
  session_expires_at: string
}

export interface SessionInfo {
  id: string
  created_at: string
  last_seen_at: string
  expires_at: string
  ip_prefix: string | null
  user_agent: string | null
  current: boolean
}

export interface AuditEvent {
  id: string
  created_at: string
  event_type: string
  severity: Severity
  outcome: string
  actor_id: string | null
  actor_email: string | null
  target_user_id: string | null
  target_email: string | null
  request_id: string | null
  ip_prefix: string | null
  details: Record<string, unknown>
  is_sample: boolean
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

export interface DailyCount {
  date: string
  info: number
  low: number
  medium: number
  high: number
}

export interface ChecklistItem {
  key: string
  label: string
  ok: boolean
  detail: string
}

export interface DashboardSummary {
  scope: 'user' | 'admin'
  active_sessions: number
  failed_logins_7d: number
  events_7d: number
  password_age_days: number
  last_login_at: string | null
  checklist: ChecklistItem[]
  daily_events: DailyCount[]
  total_users: number | null
  suspended_users: number | null
  locked_users: number | null
  high_severity_7d: number | null
}

export interface Message {
  message: string
}
