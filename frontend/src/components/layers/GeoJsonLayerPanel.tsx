import { useMemo, useState } from 'react'
import { useStudioStore } from '../../studio/store/studioStore'
import { useAppStore } from '../../stores/appStore'
import { toast } from 'sonner'
import { Eye, EyeOff, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import type { MapBlockConfig, GeoJsonLayer } from '../../studio/types'
import LayerCard, { DropZone } from './shared'
import { GeoJsonLayerIconPicker } from './MarkerIconPicker'
import { t, type Language } from '../../i18n'

function detectGeometryType(fc: { features: Array<{ geometry?: { type?: string } }> }): GeoJsonLayer['geometryType'] {
  const types = new Set<string>()
  for (const f of fc.features) {
    const t = f.geometry?.type
    if (!t) continue
    if (t === 'Point' || t === 'MultiPoint') types.add('Point')
    else if (t === 'LineString' || t === 'MultiLineString') types.add('LineString')
    else if (t === 'Polygon' || t === 'MultiPolygon') types.add('Polygon')
  }
  if (types.size === 1) return [...types][0] as GeoJsonLayer['geometryType']
  if (types.size > 1) return 'Mixed'
  return 'Point'
}

function getFeatureProperties(fc: { features: Array<{ properties?: Record<string, unknown> | null }> }): string[] {
  const first = fc.features.find(f => f.properties && Object.keys(f.properties).length > 0)
  return first?.properties ? Object.keys(first.properties) : []
}

function geoLayerTypeLabel(language: Language, type: GeoJsonLayer['geometryType']): string {
  const map: Record<string, string> = {
    Point: t(language, 'geojson.typePoint'),
    LineString: t(language, 'geojson.typeLine'),
    Polygon: t(language, 'geojson.typePolygon'),
    Mixed: t(language, 'geojson.typeMixed'),
  }
  return map[type] || type
}

const GEO_LAYER_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#e91e63', '#00bcd4', '#8bc34a']

export default function GeoJsonLayerPanel() {
  const { spec, activeMapId, patchBlockConfig } = useStudioStore()
  const { language } = useAppStore()
  const block = useMemo(
    () => (activeMapId && spec ? spec.blocks.find((b) => b.id === activeMapId) || null : null),
    [spec, activeMapId]
  )
  const cfg = (block?.config || {}) as MapBlockConfig
  const geoJsonLayers: GeoJsonLayer[] = cfg.geoJsonLayers || []
  const [open, setOpen] = useState(true)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [expandedLayerId, setExpandedLayerId] = useState<string | null>(null)

  const handleGeoJsonFile = async (file: File) => {
    if (!activeMapId) { toast.error(t(language, 'common.selectMapFirst')); return }
    if (!file.name.toLowerCase().match(/\.(geojson|json)$/)) {
      toast.error(t(language, 'geojson.onlyGeojson'))
      return
    }
    setIsUploading(true)
    try {
      const text = await file.text()
      const fc = JSON.parse(text)
      if (fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
        throw new Error(t(language, 'geojson.invalidFeatureCollection'))
      }
      const geometryType = detectGeometryType(fc)
      const columns = getFeatureProperties(fc)
      const autoName = fc.name || file.name.replace(/\.(geojson|json)$/i, '')
      const colorIndex = geoJsonLayers.length % GEO_LAYER_COLORS.length
      const id = Math.random().toString(36).slice(2, 8)
      const layer: GeoJsonLayer = {
        id, name: autoName, geojson: fc, geometryType, featureCount: fc.features.length,
        visible: true, color: GEO_LAYER_COLORS[colorIndex], opacity: 0.85,
        strokeWidth: 1.5, pointSize: 8, labelProp: columns[0] || undefined, showLegend: true,
      }
      patchBlockConfig(activeMapId, { geoJsonLayers: [...geoJsonLayers, layer] } as Record<string, unknown>)
      setExpandedLayerId(id)
      toast.success(t(language, 'geojson.loadedSummary', { name: autoName, count: fc.features.length, type: geoLayerTypeLabel(language, geometryType) }))
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t(language, 'geojson.readError'))
    } finally {
      setIsUploading(false)
    }
  }

  const removeGeoJsonLayer = (id: string) => {
    if (!activeMapId) return
    if (expandedLayerId === id) setExpandedLayerId(null)
    patchBlockConfig(activeMapId, { geoJsonLayers: geoJsonLayers.filter(l => l.id !== id) } as Record<string, unknown>)
  }

  const toggleGeoJsonVisible = (id: string) => {
    if (!activeMapId) return
    patchBlockConfig(activeMapId, { geoJsonLayers: geoJsonLayers.map(l => l.id === id ? { ...l, visible: !l.visible } : l) } as Record<string, unknown>)
  }

  const updateGeoJsonLayer = (id: string, patch: Partial<GeoJsonLayer>) => {
    if (!activeMapId) return
    patchBlockConfig(activeMapId, { geoJsonLayers: geoJsonLayers.map(l => l.id === id ? { ...l, ...patch } : l) } as Record<string, unknown>)
  }

  if (!activeMapId) {
    return (
      <div className="rounded-md border px-3 py-4 text-center text-[11px]"
        style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)', color: 'var(--text-subtle)' }}>
        {t(language, 'common.addMapToStart')}
      </div>
    )
  }

  const geoIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" />
    </svg>
  )

  return (
    <LayerCard
      label={t(language, 'geojson.label')}
      sublabel={geoJsonLayers.length > 0 ? t(language, 'common.layerCount', { count: geoJsonLayers.length }) : t(language, 'geojson.vectorOverlay')}
      hasData={geoJsonLayers.length > 0}
      visible={geoJsonLayers.length === 0 || geoJsonLayers.some(l => l.visible)}
      open={open}
      icon={<div style={{ color: '#6495ED' }}>{geoIcon}</div>}
      onToggleOpen={() => setOpen(v => !v)}
      onToggleVisible={() => {
        if (!activeMapId || geoJsonLayers.length === 0) return
        const anyVisible = geoJsonLayers.some(l => l.visible)
        patchBlockConfig(activeMapId, { geoJsonLayers: geoJsonLayers.map(l => ({ ...l, visible: !anyVisible })) } as Record<string, unknown>)
      }}
      onClear={geoJsonLayers.length > 0 ? () => {
        if (!activeMapId) return
        patchBlockConfig(activeMapId, { geoJsonLayers: [] } as Record<string, unknown>)
        setExpandedLayerId(null)
        toast.info(t(language, 'geojson.layersRemoved'))
      } : undefined}
    >
      <div className="space-y-1.5 pt-1">
        {geoJsonLayers.map(layer => {
          const isExpanded = expandedLayerId === layer.id
          const columns = layer.geojson
            ? getFeatureProperties(layer.geojson as { features: Array<{ properties?: Record<string, unknown> | null }> })
            : []
          return (
            <div key={layer.id} className="rounded-md border overflow-hidden"
              style={{ borderColor: isExpanded ? 'var(--accent)' : 'var(--border)', background: 'var(--surface-muted)' }}>
              <div className="flex items-center gap-2 px-2.5 py-2 cursor-pointer select-none"
                style={{ background: isExpanded ? 'var(--accent-soft)' : 'transparent' }}
                onClick={() => setExpandedLayerId(expandedLayerId === layer.id ? null : layer.id)}>
                {isExpanded
                  ? <ChevronDown size={11} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  : <ChevronRight size={11} style={{ color: 'var(--text-subtle)', flexShrink: 0 }} />}
                <div className="w-3 h-3 rounded-full flex-shrink-0 border border-white/30" style={{ background: layer.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold truncate" style={{ color: isExpanded ? 'var(--accent)' : 'var(--text)' }}>{layer.name}</p>
                  <p className="text-[10px]" style={{ color: 'var(--text-subtle)' }}>{t(language, 'geojson.linesCount', { count: layer.featureCount, type: geoLayerTypeLabel(language, layer.geometryType) })}</p>
                </div>
                <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                  <button onClick={() => toggleGeoJsonVisible(layer.id)} title={layer.visible ? t(language, 'common.hide') : t(language, 'common.show')}
                    className="p-1 rounded transition-colors hover:bg-[var(--surface)]"
                    style={{ color: layer.visible ? 'var(--text)' : 'var(--text-subtle)' }}>
                    {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                  </button>
                  <button onClick={() => removeGeoJsonLayer(layer.id)} title={t(language, 'common.remove')}
                    className="p-1 rounded transition-colors hover:bg-red-500/10 hover:text-red-500"
                    style={{ color: 'var(--text-subtle)' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="px-3 pb-3 space-y-2.5" style={{ borderTop: '1px solid var(--border)' }}>
                  <div className="space-y-1 pt-2">
                    <label className="text-[10px] uppercase tracking-wide text-[var(--text-subtle)] font-semibold">{t(language, 'geojson.name')}</label>
                    <input type="text" value={layer.name}
                      onChange={e => updateGeoJsonLayer(layer.id, { name: e.target.value })}
                      className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-all" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wide text-[var(--text-subtle)] font-semibold">{t(language, 'geojson.color')}</label>
                      <input type="color" value={layer.color}
                        onChange={e => updateGeoJsonLayer(layer.id, { color: e.target.value })}
                        className="w-full h-8 rounded-md border border-[var(--border)] cursor-pointer p-0.5 bg-[var(--surface)]" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wide text-[var(--text-subtle)] font-semibold">
                        {t(language, 'geojson.opacity')} · {Math.round((layer.opacity ?? 0.85) * 100)}%
                      </label>
                      <input type="range" min={0.05} max={1} step={0.05}
                        value={layer.opacity ?? 0.85}
                        onChange={e => updateGeoJsonLayer(layer.id, { opacity: +e.target.value })}
                        className="w-full accent-[var(--accent)] mt-1" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(layer.geometryType === 'LineString' || layer.geometryType === 'Polygon' || layer.geometryType === 'Mixed') && (
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wide text-[var(--text-subtle)] font-semibold">{t(language, 'geojson.strokeWidth')}</label>
                        <input type="number" min={0.5} max={10} step={0.5}
                          value={layer.strokeWidth ?? 1.5}
                          onChange={e => updateGeoJsonLayer(layer.id, { strokeWidth: +e.target.value })}
                          className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-all" />
                      </div>
                    )}
                    {(layer.geometryType === 'Point' || layer.geometryType === 'Mixed') && (
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wide text-[var(--text-subtle)] font-semibold">{t(language, 'geojson.pointSize')}</label>
                        <input type="number" min={2} max={30}
                          value={layer.pointSize ?? 8}
                          onChange={e => updateGeoJsonLayer(layer.id, { pointSize: +e.target.value })}
                          className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-all" />
                      </div>
                    )}
                  </div>
                  {(layer.geometryType === 'Point' || layer.geometryType === 'Mixed') && (
                    <GeoJsonLayerIconPicker layer={layer} onChange={(patch) => updateGeoJsonLayer(layer.id, patch)} />
                  )}
                  {columns.length > 0 && (
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wide text-[var(--text-subtle)] font-semibold">{t(language, 'geojson.labelProp')}</label>
                      <select value={layer.labelProp || ''}
                        onChange={e => updateGeoJsonLayer(layer.id, { labelProp: e.target.value || undefined })}
                        className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] appearance-none cursor-pointer">
                        <option value="">{t(language, 'geojson.noLabel')}</option>
                        {columns.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  )}
                  <label className="flex items-center gap-2 cursor-pointer pt-0.5">
                    <input type="checkbox" checked={layer.showLegend}
                      onChange={e => updateGeoJsonLayer(layer.id, { showLegend: e.target.checked })}
                      className="rounded accent-[var(--accent)]" />
                    <span className="text-xs text-[var(--text-muted)] font-medium">{t(language, 'geojson.showLegend')}</span>
                  </label>
                </div>
              )}
            </div>
          )
        })}

        <DropZone isDragging={isDragging} isUploading={isUploading}
          accept=".geojson,.json"
          hint={geoJsonLayers.length === 0 ? t(language, 'geojson.dropHint') : t(language, 'geojson.addLayer')}
          compact={geoJsonLayers.length > 0}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleGeoJsonFile(f) }}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onFile={handleGeoJsonFile}
        />
      </div>
    </LayerCard>
  )
}
