import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' })
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

export function formatDateTime(iso: string | null | undefined) {
  return iso ? dateTime.format(new Date(iso)) : '—'
}

export function timeAgo(iso: string | null | undefined) {
  if (!iso) return 'never'
  const seconds = Math.round((new Date(iso).getTime() - Date.now()) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 60) return relative.format(seconds, 'second')
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute')
  if (abs < 86400) return relative.format(Math.round(seconds / 3600), 'hour')
  return relative.format(Math.round(seconds / 86400), 'day')
}

/** Only allow same-origin, path-absolute redirect targets (blocks open redirects). */
export function safeRedirect(target: string | null | undefined, fallback = '/dashboard') {
  if (!target || !target.startsWith('/') || target.startsWith('//') || target.includes('\\')) {
    return fallback
  }
  return target
}

export function describeUserAgent(ua: string | null) {
  if (!ua) return 'Unknown device'
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : /python|httpx|curl/i.test(ua)
            ? 'API client'
            : 'Browser'
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad/.test(ua)
        ? 'iOS'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : ''
  return os ? `${browser} on ${os}` : browser
}
