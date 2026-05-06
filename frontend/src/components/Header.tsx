import { Menu, X, Sun, Moon } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useStudioStore } from '../studio/store/studioStore'
import { t } from '../i18n'
import type { MapBlockConfig } from '../studio/types'

export default function Header() {
  const { panelOpen, setPanelOpen, theme, toggleTheme, language } = useAppStore()
  const { spec, activeMapId } = useStudioStore()

  const activeMap = activeMapId && spec ? spec.blocks.find((b) => b.id === activeMapId) : null
  const cfg = (activeMap?.config || {}) as MapBlockConfig
  const areaName = cfg.areaName || cfg.name || 'Brasil'

  return (
    <div className="flex items-center gap-2">
      <button onClick={() => setPanelOpen(!panelOpen)}
        className="lg:hidden inline-flex items-center justify-center rounded-lg border bg-[var(--surface)] px-2.5 py-2 text-[var(--text-muted)] shadow-sm transition hover:text-[var(--text)]">
        {panelOpen ? <X size={18} /> : <Menu size={18} />}
      </button>
      <div className="flex items-center gap-2 rounded-lg border bg-[var(--surface)] px-2 py-1.5 text-[11px] text-[var(--text-muted)] shadow-sm">
        <span className="inline-flex h-2 w-2 rounded-full bg-[var(--success)]" />
        <span className="font-medium text-[var(--text)] truncate max-w-[120px]">{areaName}</span>
        <span className="text-[var(--text-subtle)]">{t(language, 'header.active')}</span>
      </div>
      <button onClick={toggleTheme}
        className="inline-flex items-center gap-2 rounded-lg border bg-[var(--surface)] px-2 py-1.5 text-[11px] text-[var(--text-muted)] shadow-sm transition hover:text-[var(--text)]"
        title={theme === 'dark' ? t(language, 'studio.lightMode') : t(language, 'studio.darkMode')}>
        {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        <span className="hidden sm:inline">
          {theme === 'dark' ? t(language, 'studio.lightMode') : t(language, 'studio.darkMode')}
        </span>
      </button>
    </div>
  )
}
