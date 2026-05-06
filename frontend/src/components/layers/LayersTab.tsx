import { useStudioStore } from '../../studio/store/studioStore'
import { useAppStore } from '../../stores/appStore'
import { t } from '../../i18n'
import ChoroplethLayerPanel from './ChoroplethLayerPanel'
import PointsLayerPanel from './PointsLayerPanel'
import GeoJsonLayerPanel from './GeoJsonLayerPanel'

export default function LayersTab() {
  const { activeMapId } = useStudioStore()
  const { language } = useAppStore()

  if (!activeMapId) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="h-12 w-12 rounded-xl border-2 border-dashed flex items-center justify-center mb-3"
          style={{ borderColor: 'var(--border)', color: 'var(--text-subtle)', opacity: 0.6 }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="24" height="24">
            <polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" />
          </svg>
        </div>
        <p className="text-[13px] font-semibold" style={{ color: 'var(--text)' }}>{t(language, 'layers.none')}</p>
        <p className="text-[11px] mt-1" style={{ color: 'var(--text-subtle)', lineHeight: 1.5 }}>
          {t(language, 'layers.emptyHint1')}<br />{t(language, 'layers.emptyHint2')}
        </p>
        <div className="mt-4 space-y-2 w-full">
          <button className="w-full py-2 bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-white font-semibold rounded-md transition-all text-[12px] flex items-center justify-center gap-2"
            onClick={() => {
              const panel = document.querySelector('[data-layer-type="choropleth"]') as HTMLElement
              panel?.click()
            }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
            </svg>
            {t(language, 'layers.choropleth')}
          </button>
          <button className="w-full py-2 border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] font-semibold rounded-md transition-all text-[12px] flex items-center justify-center gap-2 hover:border-[var(--border-strong)] hover:text-[var(--text)]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
            </svg>
            {t(language, 'layers.pointsCsv')}
          </button>
          <button className="w-full py-2 border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] font-semibold rounded-md transition-all text-[12px] flex items-center justify-center gap-2 hover:border-[var(--border-strong)] hover:text-[var(--text)]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" />
            </svg>
            {t(language, 'layers.geojson')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-md border px-3 py-2" style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)' }}>
        <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-subtle)' }}>{t(language, 'layers.order')}</div>
        <div className="mt-2 space-y-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          <div className="flex items-center justify-between"><span>{t(language, 'layers.customGeo')}</span><span>{t(language, 'layers.top')}</span></div>
          <div className="flex items-center justify-between"><span>{t(language, 'layers.points')}</span><span>{t(language, 'layers.above')}</span></div>
          <div className="flex items-center justify-between"><span>{t(language, 'layers.choropleth')}</span><span>{t(language, 'layers.above')}</span></div>
          <div className="flex items-center justify-between"><span>{t(language, 'layers.baseArea')}</span><span>{t(language, 'layers.middle')}</span></div>
          <div className="flex items-center justify-between"><span>{t(language, 'layers.baseMap')}</span><span>{t(language, 'layers.background')}</span></div>
        </div>
      </div>
      <ChoroplethLayerPanel />
      <PointsLayerPanel />
      <GeoJsonLayerPanel />
    </div>
  )
}
