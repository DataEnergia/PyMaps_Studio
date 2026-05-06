import { useEffect } from 'react'
import { Toaster } from 'sonner'
import { useAppStore } from './stores/appStore'
import StudioWorkspace from './studio/StudioWorkspace'
import { setCustomIcons } from './lib/mapIcons'
import { customIconApi } from './services/api'

function App() {
  const { theme } = useAppStore()

  useEffect(() => {
    document.body.classList.toggle('theme-dark', theme === 'dark')
  }, [theme])

  // Load custom icons from backend on app start
  useEffect(() => {
    customIconApi.list()
      .then((icons) => setCustomIcons(icons))
      .catch(() => { /* silently fail if backend is not ready */ })
  }, [])

  return (
    <div className="relative w-screen h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
      <StudioWorkspace />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            color: 'var(--text)',
            fontFamily: 'var(--font-sans)',
            fontSize: '13px',
            boxShadow: 'var(--shadow)',
          },
        }}
      />
    </div>
  )
}

export default App
