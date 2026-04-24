import { create } from 'zustand'

type Theme = 'light' | 'dark'

interface ThemeStore {
  theme: Theme
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

export const useTheme = create<ThemeStore>((set) => ({
  theme: (localStorage.getItem('shippeco-theme') as Theme) || 'light',
  toggleTheme: () =>
    set((state) => {
      const newTheme = state.theme === 'light' ? 'dark' : 'light'
      localStorage.setItem('shippeco-theme', newTheme)
      applyTheme(newTheme)
      return { theme: newTheme }
    }),
  setTheme: (theme: Theme) => {
    localStorage.setItem('shippeco-theme', theme)
    applyTheme(theme)
    set({ theme })
  },
}))

export function initTheme() {
  const saved = localStorage.getItem('shippeco-theme') as Theme | null
  const theme = saved || 'light'
  applyTheme(theme)
}
