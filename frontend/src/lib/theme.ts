import { useCallback, useState } from 'react'

export type Theme = 'dark' | 'light'

function currentTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(currentTheme)
  const setTheme = useCallback((next: Theme) => {
    document.documentElement.setAttribute('data-theme', next)
    try {
      localStorage.setItem('ss-theme', next) // UI preference only; never auth state
    } catch {
      /* storage unavailable */
    }
    setThemeState(next)
  }, [])
  return { theme, setTheme, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark') }
}
