import { create } from 'zustand'
import type { Language } from '../i18n'

const getInitialLanguage = (): Language => {
  if (typeof window === 'undefined') return 'pt'
  const saved = window.localStorage.getItem('pymaps_language')
  if (saved === 'pt' || saved === 'es' || saved === 'en') return saved
  if (saved === 'pt-BR') return 'pt'
  return 'pt'
}

interface AppState {
  // UI
  panelOpen: boolean
  theme: 'light' | 'dark'
  language: Language
  isLoading: boolean

  // Actions
  setPanelOpen: (open: boolean) => void
  setTheme: (theme: 'light' | 'dark') => void
  setLanguage: (language: Language) => void
  toggleTheme: () => void
  setLoading: (loading: boolean) => void
}

export const useAppStore = create<AppState>((set) => ({
  panelOpen: true,
  theme: 'dark',
  language: getInitialLanguage(),
  isLoading: false,

  setPanelOpen: (open) => set({ panelOpen: open }),
  setTheme: (theme) => set({ theme }),
  setLanguage: (language) => {
    if (typeof window !== 'undefined') window.localStorage.setItem('pymaps_language', language)
    set({ language })
  },
  toggleTheme: () =>
    set((state) => ({ theme: state.theme === 'light' ? 'dark' : 'light' })),
  setLoading: (loading) => set({ isLoading: loading }),
}))
