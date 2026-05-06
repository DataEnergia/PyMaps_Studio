import { useMemo, useCallback } from 'react'
import { useStudioStore } from '../../studio/store/studioStore'
import { useAppStore } from '../../stores/appStore'
import type { MapBlockConfig } from '../../studio/types'
import ColorPicker from '../ColorPicker'
import { t } from '../../i18n'

export default function VisualTab() {
  const { spec, activeMapId, patchBlockConfig } = useStudioStore()
  const { language } = useAppStore()
  const block = useMemo(
    () => (activeMapId && spec ? spec.blocks.find((b) => b.id === activeMapId) || null : null),
    [spec, activeMapId]
  )
  const config = (block?.config || {}) as MapBlockConfig
  const set = useCallback((patch: Partial<MapBlockConfig>) => {
    if (activeMapId) patchBlockConfig(activeMapId, patch as Record<string, unknown>)
  }, [activeMapId, patchBlockConfig])

  const fillColor = config.fillColor || '#2d3742'
  const borderColor = config.borderColor || '#7a8a9a'
  const borderWidth = config.borderWidth ?? 1
  const fillOpacity = config.fillOpacity ?? 0.85
  const showStateLabels = config.showStateLabels !== false
  const stateLabelColor = config.stateLabelColor || '#ffffff'
  const stateLabelSize = config.stateLabelSize || 12
  const showInternalBorders = config.showInternalBorders !== false
  const showOuterBorder = !!config.showOuterBorder
  const hasPointLayers = (config.pointLayers?.length || 0) > 0
  const hasChoropleth = config.choroplethMode && (config.choroplethData?.length || 0) > 0

  if (!activeMapId) {
    return (
      <div className="rounded-md border px-3 py-4 text-center text-[11px]"
        style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)', color: 'var(--text-subtle)' }}>
        {t(language, 'common.addMapToStart')}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-subtle)]">{t(language, 'visual.view')}</p>
        <h3 className="text-[var(--text)] font-semibold text-sm">{t(language, 'visual.styleOf')} {config.name || t(language, 'left.map').toLowerCase()}</h3>
      </div>

      {/* Fill & Border Colors */}
      <div className="space-y-3">
        <label className="text-xs text-[var(--text-subtle)] font-medium">{t(language, 'visual.layerColors')}</label>
        <div className="space-y-2">
          <ColorRow label={t(language, 'visual.fill')} value={fillColor} onChange={(v) => set({ fillColor: v })} />
          <ColorRow label={t(language, 'visual.border')} value={borderColor} onChange={(v) => set({ borderColor: v })} />
        </div>
      </div>

      {/* Fill Opacity */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-[var(--text-subtle)] font-medium">{t(language, 'visual.fillOpacity')}</label>
          <span className="text-xs text-[var(--text-subtle)] font-mono bg-[var(--surface-muted)] px-2 py-0.5 rounded-md">
            {Math.round(fillOpacity * 100)}%
          </span>
        </div>
        <input type="range" min={0.1} max={1} step={0.05} value={fillOpacity}
          onChange={(e) => set({ fillOpacity: parseFloat(e.target.value) })}
          className="w-full h-1.5 bg-[var(--surface-muted)] rounded-full appearance-none cursor-pointer accent-[var(--accent)]" />
      </div>

      {/* Border Width */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-[var(--text-subtle)] font-medium">{t(language, 'visual.borderWidth')}</label>
          <span className="text-xs text-[var(--text-subtle)] font-mono bg-[var(--surface-muted)] px-2 py-0.5 rounded-md">{borderWidth}px</span>
        </div>
        <input type="range" min={0} max={8} step={0.5} value={borderWidth}
          onChange={(e) => set({ borderWidth: parseFloat(e.target.value) })}
          className="w-full h-1.5 bg-[var(--surface-muted)] rounded-full appearance-none cursor-pointer accent-[var(--accent)]" />
      </div>

      {/* Borders */}
      <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-subtle)' }}>{t(language, 'visual.borders')}</p>
        <ToggleRow label={t(language, 'visual.innerBorders')} value={showInternalBorders} onChange={(v) => set({ showInternalBorders: v })} />
        <ToggleRow label={t(language, 'visual.outerBorder')} value={showOuterBorder} onChange={(v) => set({ showOuterBorder: v })} />
        {showOuterBorder && (
          <div className="space-y-2 pl-1 border-l-2 ml-1" style={{ borderColor: 'var(--accent)' }}>
            <ColorRow label={t(language, 'visual.outlineColor')} value={config.outerBorderColor || '#ffffff'} onChange={(v) => set({ outerBorderColor: v })} />
            <div className="flex items-center justify-between">
                <label className="text-[10px] text-[var(--text-subtle)]">{t(language, 'visual.thickness')}</label>
              <span className="text-[10px] font-mono" style={{ color: 'var(--text-subtle)' }}>{config.outerBorderWidth ?? 2}px</span>
            </div>
            <input type="range" min={0.5} max={20} step={0.5} value={config.outerBorderWidth ?? 2}
              onChange={(e) => set({ outerBorderWidth: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-[var(--surface-muted)] rounded-full appearance-none cursor-pointer accent-[var(--accent)]" />
          </div>
        )}
      </div>

      {/* State labels */}
      <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3">
        <ToggleRow label={t(language, 'visual.stateLabels')} value={showStateLabels} onChange={(v) => set({ showStateLabels: v })} />
        {showStateLabels && (
          <div className="space-y-3 pl-1 border-l-2 ml-1" style={{ borderColor: 'var(--accent)' }}>
            <ColorRow label={t(language, 'visual.labelColor')} value={stateLabelColor} onChange={(v) => set({ stateLabelColor: v })} />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                  <label className="text-xs text-[var(--text-subtle)] font-medium">{t(language, 'visual.size')}</label>
                <span className="text-xs text-[var(--text-subtle)] font-mono bg-[var(--surface-muted)] px-2 py-0.5 rounded-md">{stateLabelSize}px</span>
              </div>
              <input type="range" min={8} max={32} step={1} value={stateLabelSize}
                onChange={(e) => set({ stateLabelSize: parseFloat(e.target.value) })}
                className="w-full h-1.5 bg-[var(--surface-muted)] rounded-full appearance-none cursor-pointer accent-[var(--accent)]" />
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      {(hasChoropleth || hasPointLayers) && (
        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-3">
          <ToggleRow label={t(language, 'visual.mapLegend')} value={config.showLegend !== false} onChange={(v) => set({ showLegend: v })} />
          {config.showLegend !== false && (
            <div className="space-y-3 pl-1 border-l-2 ml-1" style={{ borderColor: 'var(--accent)' }}>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] text-[var(--text-subtle)]">{t(language, 'visual.size')}</label>
                  <span className="text-[10px] font-mono" style={{ color: 'var(--text-subtle)' }}>
                    {((config.legendScale ?? 1.0) * 100).toFixed(0)}%
                  </span>
                </div>
                <input type="range" min={0.5} max={3} step={0.05} value={config.legendScale ?? 1.0}
                  onChange={(e) => set({ legendScale: parseFloat(e.target.value) })}
                  className="w-full h-1.5 bg-[var(--surface-muted)] rounded-full appearance-none cursor-pointer accent-[var(--accent)]" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-[var(--text-subtle)]">{t(language, 'layers.background')}</label>
                <ColorPicker
                  value={config.legendBg || 'transparent'}
                  onChange={(v) => set({ legendBg: v })}
                  allowTransparent
                />
              </div>
              {hasPointLayers && (
                <ToggleRow label={t(language, 'visual.showPointsLegend')} value={config.showPointsLegend !== false} onChange={(v) => set({ showPointsLegend: v })} />
              )}
              {hasChoropleth && (
                <ToggleRow label={t(language, 'visual.showColorScale')} value={config.showChoroplethLegend !== false} onChange={(v) => set({ showChoroplethLegend: v })} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2">
      <span className="text-xs font-semibold flex-shrink-0" style={{ color: 'var(--text)' }}>{label}</span>
      <ColorPicker value={value} onChange={onChange} />
    </div>
  )
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <button type="button" onClick={() => onChange(!value)}
        className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors"
        style={{ background: value ? 'var(--accent)' : 'var(--surface-muted)' }}>
        <span className="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform"
          style={{ transform: value ? 'translateX(18px)' : 'translateX(2px)' }} />
      </button>
    </label>
  )
}
