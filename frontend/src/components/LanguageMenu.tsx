import { useEffect, useRef, useState } from 'react'
import { Languages, ChevronDown } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { t, type Language } from '../i18n'

const options: Language[] = ['pt', 'es', 'en']

export default function LanguageMenu() {
  const { language, setLanguage } = useAppStore()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors"
        style={{
          background: open ? 'var(--accent-soft)' : 'transparent',
          color: open ? 'var(--accent)' : 'var(--text-muted)',
          border: '1px solid transparent',
        }}
        onMouseEnter={(e) => { if (!open) { e.currentTarget.style.background = 'var(--surface-strong)'; e.currentTarget.style.borderColor = 'var(--border)' } }}
        onMouseLeave={(e) => { if (!open) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent' } }}
      >
        <Languages size={13} />
        {t(language, 'language.label')}
        <ChevronDown size={11} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 rounded-lg py-1.5 min-w-[180px]"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            boxShadow: '0 16px 48px rgba(0,0,0,0.35)',
            zIndex: 99999,
          }}
        >
          {options.map((item) => {
            const active = item === language
            return (
              <button
                key={item}
                onClick={() => { setLanguage(item); setOpen(false) }}
                className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-[11px] text-left transition-colors"
                style={{
                  color: active ? 'var(--accent)' : 'var(--text)',
                  background: active ? 'var(--accent-soft)' : 'transparent',
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--surface-strong)' }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}
              >
                <span>{t(language, `language.${item}`)}</span>
                {active ? <span style={{ fontSize: 10 }}>●</span> : null}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
