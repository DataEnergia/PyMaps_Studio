import { useMemo, useState } from 'react'
import { useStudioStore } from '../../studio/store/studioStore'
import { useAppStore } from '../../stores/appStore'
import { uploadApi, geoApi } from '../../services/api'
import { toast } from 'sonner'
import { Eye, EyeOff, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import type { MapBlockConfig, PointLayer } from '../../studio/types'
import { GeoJsonLayerIconPicker } from './MarkerIconPicker'
import LayerCard, { DropZone, FileInfo, ColSelect } from './shared'
import { t } from '../../i18n'

const POINT_COLORS = ['#d9822b', '#3498db', '#2ecc71', '#e74c3c', '#9b59b6', '#1abc9c', '#f39c12', '#e91e63', '#00bcd4', '#8bc34a']

interface PendingFile {
  name: string
  rows: any[]
  columns: string[]
}

export default function PointsLayerPanel() {
  const { spec, activeMapId, patchBlockConfig } = useStudioStore()
  const { language } = useAppStore()

  const block = useMemo(
    () => (activeMapId && spec ? spec.blocks.find((b) => b.id === activeMapId) || null : null),
    [spec, activeMapId]
  )
  const cfg = (block?.config || {}) as MapBlockConfig
  const pointLayers: PointLayer[] = cfg.pointLayers || []

  const [open, setOpen] = useState(true)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [expandedLayerId, setExpandedLayerId] = useState<string | null>(null)

  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null)
  const [pendingLatCol, setPendingLatCol] = useState('')
  const [pendingLonCol, setPendingLonCol] = useState('')
  const [pendingName, setPendingName] = useState('')
  const [pendingColor, setPendingColor] = useState('#d9822b')
  const [pendingFilterByArea, setPendingFilterByArea] = useState(true)

  const handlePointFile = async (file: File) => {
    if (!activeMapId) { toast.error(t(language, 'common.selectMapFirst')); return }
    setIsUploading(true)
    try {
      const result = await uploadApi.uploadFile(file)
      setPendingFile({ name: file.name, rows: result.data, columns: result.columns })
      setPendingLatCol('')
      setPendingLonCol('')
      setPendingName(file.name.replace(/\.(csv|xlsx|xls)$/i, ''))
      setPendingColor(POINT_COLORS[pointLayers.length % POINT_COLORS.length])
      setPendingFilterByArea(true)
      toast.success(t(language, 'common.recordsLoaded', { count: result.row_count }))
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t(language, 'common.uploadError'))
    } finally {
      setIsUploading(false)
    }
  }

  const confirmAddLayer = async () => {
    if (!activeMapId || !pendingFile || !pendingLatCol || !pendingLonCol) return
    const rawPoints = pendingFile.rows
      .map((row: any) => ({ lat: parseFloat(String(row[pendingLatCol])), lon: parseFloat(String(row[pendingLonCol])) }))
      .filter((p: any) => !isNaN(p.lat) && !isNaN(p.lon))
    if (rawPoints.length === 0) { toast.error(t(language, 'points.noValidCoords')); return }

    const id = Math.random().toString(36).slice(2, 8)
    const name = pendingName || t(language, 'points.defaultName', { count: pointLayers.length + 1 })

    if (pendingFilterByArea) {
      const filterGeo = cfg.choroplethGeojson || cfg.geojson
      if (filterGeo) {
        try {
          toast.loading(t(language, 'points.filteringByArea'))
          const result = await geoApi.filterPoints(rawPoints, filterGeo)
          toast.dismiss()
          const layer: PointLayer = {
            id, name, points: result.filtered_points, pointCount: result.filtered_points.length,
            visible: true, color: pendingColor, size: 6, showLegend: true,
            filterByArea: true, rawPoints,
          }
          patchBlockConfig(activeMapId, { pointLayers: [...pointLayers, layer] } as Record<string, unknown>)
          toast.success(t(language, 'points.filteredCount', { name, matched: result.matched, total: result.total }))
        } catch {
          toast.dismiss()
          const layer: PointLayer = {
            id, name, points: rawPoints, pointCount: rawPoints.length,
            visible: true, color: pendingColor, size: 6, showLegend: true,
            filterByArea: true, rawPoints,
          }
          patchBlockConfig(activeMapId, { pointLayers: [...pointLayers, layer] } as Record<string, unknown>)
          toast.success(t(language, 'points.addedCount', { name, count: rawPoints.length }))
        }
      } else {
        const layer: PointLayer = {
          id, name, points: rawPoints, pointCount: rawPoints.length,
          visible: true, color: pendingColor, size: 6, showLegend: true,
          filterByArea: false, rawPoints,
        }
        patchBlockConfig(activeMapId, { pointLayers: [...pointLayers, layer] } as Record<string, unknown>)
        toast.success(t(language, 'points.addedCount', { name, count: rawPoints.length }))
      }
    } else {
      const layer: PointLayer = {
        id, name, points: rawPoints, pointCount: rawPoints.length,
        visible: true, color: pendingColor, size: 6, showLegend: true,
        filterByArea: false, rawPoints,
      }
      patchBlockConfig(activeMapId, { pointLayers: [...pointLayers, layer] } as Record<string, unknown>)
      toast.success(t(language, 'points.addedCount', { name, count: rawPoints.length }))
    }

    setPendingFile(null)
    setPendingLatCol('')
    setPendingLonCol('')
    setExpandedLayerId(id)
  }

  const removeLayer = (id: string) => {
    if (!activeMapId) return
    if (expandedLayerId === id) setExpandedLayerId(null)
    patchBlockConfig(activeMapId, { pointLayers: pointLayers.filter(l => l.id !== id) } as Record<string, unknown>)
  }

  const toggleVisible = (id: string) => {
    if (!activeMapId) return
    patchBlockConfig(activeMapId, { pointLayers: pointLayers.map(l => l.id === id ? { ...l, visible: !l.visible } : l) } as Record<string, unknown>)
  }

  const updateLayer = (id: string, patch: Partial<PointLayer>) => {
    if (!activeMapId) return
    patchBlockConfig(activeMapId, { pointLayers: pointLayers.map(l => l.id === id ? { ...l, ...patch } : l) } as Record<string, unknown>)
  }

  const reFilterByArea = async (layer: PointLayer) => {
    if (!activeMapId) return
    const filterGeo = cfg.choroplethGeojson || cfg.geojson
    if (!filterGeo || !layer.rawPoints) { toast.error(t(language, 'points.noAreaGeometry')); return }
    try {
      toast.loading(t(language, 'points.refiltering'))
      const result = await geoApi.filterPoints(layer.rawPoints!, filterGeo)
      toast.dismiss()
      updateLayer(layer.id, { points: result.filtered_points, pointCount: result.filtered_points.length })
      toast.success(t(language, 'points.matchedTotal', { matched: result.matched, total: result.total }))
    } catch {
      toast.dismiss()
      toast.error(t(language, 'points.filterError'))
    }
  }

  if (!activeMapId) {
    return (
      <div className="rounded-md border px-3 py-4 text-center text-[11px]"
        style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)', color: 'var(--text-subtle)' }}>
        {t(language, 'common.addMapToStart')}
      </div>
    )
  }

  const pointIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  )

  return (
    <LayerCard
      label={t(language, 'layers.points')}
      sublabel={pointLayers.length > 0 ? t(language, 'common.layerCount', { count: pointLayers.length }) : t(language, 'points.csvLatLon')}
      hasData={pointLayers.length > 0}
      visible={pointLayers.length === 0 || pointLayers.some(l => l.visible)}
      open={open}
      icon={<div style={{ color: 'var(--success)' }}>{pointIcon}</div>}
      onToggleOpen={() => setOpen(v => !v)}
      onToggleVisible={() => {
        if (!activeMapId || pointLayers.length === 0) return
        const anyVisible = pointLayers.some(l => l.visible)
        patchBlockConfig(activeMapId, { pointLayers: pointLayers.map(l => ({ ...l, visible: !anyVisible })) } as Record<string, unknown>)
      }}
      onClear={pointLayers.length > 0 ? () => {
        if (!activeMapId) return
        patchBlockConfig(activeMapId, { pointLayers: [] } as Record<string, unknown>)
        setExpandedLayerId(null)
        toast.info(t(language, 'points.layersRemoved'))
      } : undefined}
    >
      <div className="space-y-1.5 pt-1">
        {pointLayers.map(layer => {
          const isExpanded = expandedLayerId === layer.id
          return (
            <div key={layer.id} className="rounded-md border overflow-hidden"
              style={{ borderColor: isExpanded ? 'var(--accent)' : 'var(--border)', background: 'var(--surface-muted)' }}>
              <div className="flex items-center gap-2 px-2.5 py-2 cursor-pointer select-none"
                style={{ background: isExpanded ? 'var(--accent-soft)' : 'transparent' }}
                onClick={() => setExpandedLayerId(expandedLayerId === layer.id ? null : layer.id)}>
                {isExpanded
                  ? <ChevronDown size={11} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                  : <ChevronRight size={11} style={{ color: 'var(--text-subtle)', flexShrink: 0 }} />}
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: layer.color }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold truncate" style={{ color: isExpanded ? 'var(--accent)' : 'var(--text)' }}>{layer.name}</p>
                  <p className="text-[10px]" style={{ color: 'var(--text-subtle)' }}>
                    {t(language, 'points.count', { count: layer.pointCount })}{layer.filterByArea ? ` · ${t(language, 'points.areaFilter')}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                  <button onClick={() => toggleVisible(layer.id)} title={layer.visible ? t(language, 'common.hide') : t(language, 'common.show')}
                    className="p-1 rounded transition-colors hover:bg-[var(--surface)]"
                    style={{ color: layer.visible ? 'var(--text)' : 'var(--text-subtle)' }}>
                    {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                  </button>
                  <button onClick={() => removeLayer(layer.id)} title={t(language, 'common.remove')}
                    className="p-1 rounded transition-colors hover:bg-red-500/10 hover:text-red-500"
                    style={{ color: 'var(--text-subtle)' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="px-3 pb-3 space-y-2.5" style={{ borderTop: '1px solid var(--border)' }}>
                  <div className="space-y-1 pt-2">
                    <label className="text-[10px] uppercase tracking-wide text-[var(--text-subtle)] font-semibold">{t(language, 'points.layerName')}</label>
                    <input type="text" value={layer.name}
                      onChange={e => updateLayer(layer.id, { name: e.target.value })}
                      className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-all" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wide text-[var(--text-subtle)] font-semibold">{t(language, 'points.color')}</label>
                      <input type="color" value={layer.color}
                        onChange={e => updateLayer(layer.id, { color: e.target.value })}
                        className="w-full h-8 rounded-md border border-[var(--border)] cursor-pointer p-0.5 bg-[var(--surface)]" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wide text-[var(--text-subtle)] font-semibold">{t(language, 'points.size')}</label>
                      <input type="number" min={2} max={48}
                        value={layer.size ?? 6}
                        onChange={e => updateLayer(layer.id, { size: +e.target.value })}
                        className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-all" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase tracking-wide text-[var(--text-subtle)] font-semibold">{t(language, 'points.opacity')} · {Math.round((layer.opacity ?? 0.92) * 100)}%</label>
                    <input type="range" min={0.1} max={1} step={0.05}
                      value={layer.opacity ?? 0.92}
                      onChange={e => updateLayer(layer.id, { opacity: +e.target.value })}
                      className="w-full accent-[var(--accent)]" />
                  </div>
                  <GeoJsonLayerIconPicker layer={layer}
                    onChange={(patch) => updateLayer(layer.id, patch as Partial<PointLayer>)} />
                  {layer.icon && (
                    <div className="space-y-1.5">
                      <label className="text-[10px] uppercase tracking-wide text-[var(--text-subtle)] font-semibold">{t(language, 'points.markerStyle')}</label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(['circle', 'naked', 'pin'] as const).map((s) => {
                          const labels: Record<string, string> = { circle: t(language, 'points.styleCircle'), naked: t(language, 'points.styleIcon'), pin: t(language, 'points.stylePin') }
                          const active = (layer.style || 'circle') === s
                          return (
                            <button key={s} onClick={() => updateLayer(layer.id, { style: s })}
                              className="py-1.5 rounded-md border text-[11px] font-semibold transition-all"
                              style={{
                                background: active ? 'var(--accent-soft)' : 'var(--surface)',
                                borderColor: active ? 'var(--accent)' : 'var(--border)',
                                color: active ? 'var(--accent)' : 'var(--text-muted)',
                              }}>
                              {labels[s]}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wide text-[var(--text-subtle)] font-semibold">{t(language, 'points.strokeWidth')}</label>
                      <input type="number" min={0} max={5} step={0.5}
                        value={layer.strokeWidth ?? 1.5}
                        onChange={e => updateLayer(layer.id, { strokeWidth: +e.target.value })}
                        className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-all" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] uppercase tracking-wide text-[var(--text-subtle)] font-semibold">{t(language, 'points.strokeColor')}</label>
                      <input type="color" value={layer.strokeColor || '#ffffff'}
                        onChange={e => updateLayer(layer.id, { strokeColor: e.target.value })}
                        className="w-full h-8 rounded-md border border-[var(--border)] cursor-pointer p-0.5 bg-[var(--surface)]" />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer pt-0.5">
                    <input type="checkbox" checked={layer.filterByArea ?? false}
                      onChange={e => {
                        const filterByArea = e.target.checked
                        if (filterByArea && layer.rawPoints) {
                          reFilterByArea(layer)
                        } else if (!filterByArea && layer.rawPoints) {
                          updateLayer(layer.id, { filterByArea: false, points: layer.rawPoints })
                        } else {
                          updateLayer(layer.id, { filterByArea })
                        }
                      }}
                      className="rounded accent-[var(--accent)]" />
                    <span className="text-xs text-[var(--text-muted)] font-medium">{t(language, 'points.filterByArea')}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer pt-0.5">
                    <input type="checkbox" checked={layer.showLegend}
                      onChange={e => updateLayer(layer.id, { showLegend: e.target.checked })}
                      className="rounded accent-[var(--accent)]" />
                    <span className="text-xs text-[var(--text-muted)] font-medium">{t(language, 'points.showLegend')}</span>
                  </label>
                </div>
              )}
            </div>
          )
        })}

        <DropZone isDragging={isDragging} isUploading={isUploading}
          accept=".csv,.xlsx,.xls"
          hint={pointLayers.length === 0 ? t(language, 'points.csvLatLon') : t(language, 'points.addLayer')}
          compact={pointLayers.length > 0}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handlePointFile(f) }}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onFile={handlePointFile}
        />

        {pendingFile && (
          <div className="space-y-2.5 pt-1">
            <FileInfo name={t(language, 'points.recordsCols', { count: pendingFile.rows.length, cols: pendingFile.columns.length })}
              onClear={() => setPendingFile(null)} />
            <div className="grid grid-cols-2 gap-2">
              <ColSelect label={t(language, 'points.latCol')} value={pendingLatCol} columns={pendingFile.columns} onChange={setPendingLatCol} />
              <ColSelect label={t(language, 'points.lonCol')} value={pendingLonCol} columns={pendingFile.columns} onChange={setPendingLonCol} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-[var(--text-subtle)] font-medium">{t(language, 'points.layerName')}</label>
              <input type="text" value={pendingName}
                onChange={e => setPendingName(e.target.value)}
                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-md px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-all"
                placeholder={t(language, 'points.namePlaceholder')} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-xs text-[var(--text-subtle)] font-medium">{t(language, 'points.color')}</label>
                <input type="color" value={pendingColor}
                  onChange={e => setPendingColor(e.target.value)}
                  className="w-full h-9 rounded-md border border-[var(--border)] cursor-pointer p-1 bg-[var(--surface)]" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={pendingFilterByArea}
                  onChange={e => setPendingFilterByArea(e.target.checked)}
                  className="rounded accent-[var(--accent)]" />
                <span className="text-xs text-[var(--text-muted)] font-medium">{t(language, 'points.filterByAreaShort')}</span>
              </label>
            </div>
            <button onClick={confirmAddLayer}
              disabled={!pendingLatCol || !pendingLonCol}
              className="w-full py-2 bg-[var(--accent)] hover:bg-[var(--accent-strong)] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-md transition-all text-sm">
              {t(language, 'points.addToMap')}
            </button>
          </div>
        )}
      </div>
    </LayerCard>
  )
}
