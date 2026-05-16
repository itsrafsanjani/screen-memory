import { useEffect } from 'react'

export function useTheme(): void {
  useEffect(() => {
    const apply = (isDark: boolean): void => {
      document.documentElement.classList.toggle('dark', isDark)
    }
    window.electronAPI.getNativeTheme().then(apply)
    return window.electronAPI.onThemeChanged(apply)
  }, [])
}
