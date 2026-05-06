import { Download, X } from 'lucide-react'
import { useStudioStore } from './store/studioStore'
import { useAppStore } from '../stores/appStore'
import { t } from '../i18n'

export default function ExportPanel() {
  const { exportMode, setExportMode } = useStudioStore()
  const { language } = useAppStore()
  const isSelecting = exportMode === 'selecting'

  return (
    <button
      onClick={() => setExportMode(isSelecting ? 'idle' : 'selecting')}
      style={{
        padding: '6px 14px',
        borderRadius: 8,
        border: 'none',
        background: isSelecting ? 'var(--danger)' : 'var(--accent)',
        color: '#ffffff',
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        letterSpacing: '0.01em',
        transition: 'opacity 0.1s',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.88' }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
    >
      {isSelecting ? <X size={12} /> : <Download size={12} />}
      {isSelecting ? t(language, 'common.cancel') : t(language, 'common.export')}
    </button>
  )
}
