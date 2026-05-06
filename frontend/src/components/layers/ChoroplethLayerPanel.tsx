import { useState, useMemo, useCallback } from 'react'
import { useStudioStore } from '../../studio/store/studioStore'
import { useAppStore } from '../../stores/appStore'
import { uploadApi, ibgeApi } from '../../services/api'
import { toast } from 'sonner'
import type { MapBlockConfig, ChoroplethRow } from '../../studio/types'
import { CHOROPLETH_PALETTES } from '../../utils/colorScale'
import LayerCard, { Stepper, SectionLabel, DropZone, FileInfo, ColSelect } from './shared'
import { t, type Language } from '../../i18n'

type GeoLevel = 'municipio' | 'uf' | 'region' | 'unknown'

const UF_ABBR = new Set(['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'])

function detectGeoLevel(rows: ChoroplethRow[], idCol: string): GeoLevel {
  const sample = rows.slice(0, 30).map(r => String(r[idCol] ?? '').trim()).filter(Boolean)
  if (!sample.length) return 'unknown'
  const score = (fn: (v: string) => boolean) => sample.filter(fn).length / sample.length
  if (score(v => /^\d{7}$/.test(v)) > 0.5) return 'municipio'
  if (score(v => /^\d{6}$/.test(v)) > 0.5) return 'municipio'
  if (score(v => UF_ABBR.has(v.toUpperCase())) > 0.5) return 'uf'
  if (score(v => /^\d{2}$/.test(v) && +v >= 11 && +v <= 53) > 0.5) return 'uf'
  if (score(v => /^\d$/.test(v) && +v >= 1 && +v <= 5) > 0.5) return 'region'
  return 'unknown'
}

function geoLevelLabel(language: Language, level: GeoLevel): string {
  const map: Record<GeoLevel, string> = {
    municipio: t(language, 'choropleth.levelMunicipio'),
    uf: t(language, 'choropleth.levelUf'),
    region: t(language, 'choropleth.levelRegion'),
    unknown: t(language, 'choropleth.levelUnknown'),
  }
  return map[level]
}

function extractUFCodesFromMunicipios(rows: ChoroplethRow[], idCol: string): number[] {
  const codes = new Set<number>()
  for (const row of rows) {
    const v = String(row[idCol] ?? '').trim()
    if (/^\d{6,7}$/.test(v)) codes.add(parseInt(v.substring(0, 2)))
  }
  return [...codes].filter(c => c >= 11 && c <= 53)
}

function mergeFeatureCollections(fcs: GeoJSON.FeatureCollection[]): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features: fcs.flatMap(fc => fc.features) }
}

export default function ChoroplethLayerPanel() {
  const { spec, activeMapId, patchBlockConfig } = useStudioStore()
  const { language } = useAppStore()

  const block = useMemo(
    () => (activeMapId && spec ? spec.blocks.find((b) => b.id === activeMapId) || null : null),
    [spec, activeMapId]
  )
  const cfg = (block?.config || {}) as MapBlockConfig

  const hasChoroplethData = (cfg.choroplethData?.length || 0) > 0
  const choroplethVisible = cfg.choroplethLayerVisible !== false
  const choroplethIdCol = cfg.choroplethIdCol || ''
  const choroplethValueCol = cfg.choroplethValueCol || ''
  const choroplethUnit = cfg.choroplethUnit || ''
  const choroplethClasses = cfg.choroplethClasses || 5
  const choroplethPalette = cfg.choroplethPalette || 'blue'

const [open, setOpen] = useState(true)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [choroplethFile, setChoroplethFile] = useState<{ name: string; rows: ChoroplethRow[]; columns: string[] } | null>(null)
  const [detectedLevel, setDetectedLevel] = useState<GeoLevel | null>(null)
  const [editing, setEditing] = useState(false)

  const set = useCallback((patch: Partial<MapBlockConfig>) => {
    if (activeMapId) patchBlockConfig(activeMapId, patch as Record<string, unknown>)
  }, [activeMapId, patchBlockConfig])

  const handleChoroplethFile = async (file: File) => {
    setIsUploading(true)
    try {
      const name = file.name.toLowerCase()
      if (name.endsWith('.geojson') || name.endsWith('.json')) {
        const text = await file.text()
        const geojson = JSON.parse(text)
        const features = geojson.features || []
        if (!features.length) throw new Error(t(language, 'choropleth.geojsonNoFeatures'))
        const rows: ChoroplethRow[] = features.map((f: any) => ({ ...f.properties }))
        const columns = rows.length ? Object.keys(rows[0]) : []
        setChoroplethFile({ name: file.name, rows, columns })
        toast.success(t(language, 'choropleth.featuresLoaded', { count: rows.length }))
      } else {
        const result = await uploadApi.uploadFile(file)
        const rows = result.data as ChoroplethRow[]
        setChoroplethFile({ name: file.name, rows, columns: result.columns })
        toast.success(t(language, 'common.recordsLoaded', { count: result.row_count }))
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t(language, 'choropleth.processFileError'))
    } finally {
      setIsUploading(false)
    }
  }

  const applyChoropleth = async () => {
    if (!activeMapId) { toast.error(t(language, 'common.selectMapFirst')); return }
    if (!choroplethFile) { toast.error(t(language, 'choropleth.loadFileFirst')); return }
    if (!choroplethIdCol || !choroplethValueCol) {
      toast.error(t(language, 'choropleth.selectAreaAndValueCols'))
      return
    }
    const hasNumbers = choroplethFile.rows.slice(0, 10).some((r) => !isNaN(Number(r[choroplethValueCol])))
    if (!hasNumbers) { toast.error(t(language, 'choropleth.valueNotNumeric')); return }

    const level = detectGeoLevel(choroplethFile.rows, choroplethIdCol)
    setDetectedLevel(level)
    setIsApplying(true)

    try {
      let loadedGeo: GeoJSON.FeatureCollection | null = null

      if (level === 'municipio') {
        const ufCodes = extractUFCodesFromMunicipios(choroplethFile.rows, choroplethIdCol)
        if (ufCodes.length === 0) { toast.error(t(language, 'choropleth.cannotExtractUf')); return }
        toast.loading(t(language, 'choropleth.loadingMunicipios', { count: ufCodes.length }), { id: 'geo-load' })
        const fcs = await Promise.all(ufCodes.map((id) => ibgeApi.getGeoJSON('uf', id) as Promise<GeoJSON.FeatureCollection>))
        loadedGeo = mergeFeatureCollections(fcs)
        toast.success(t(language, 'choropleth.municipiosLoaded', { count: loadedGeo.features.length }), { id: 'geo-load' })
      } else if (level === 'uf' || level === 'region') {
        toast.loading(t(language, 'choropleth.loadingBrazilMap'), { id: 'geo-load' })
        loadedGeo = await ibgeApi.getGeoJSON('brasil') as GeoJSON.FeatureCollection
        toast.success(t(language, 'choropleth.brazilMapLoaded'), { id: 'geo-load' })
      }

      const patch: Partial<MapBlockConfig> = {
        choroplethData: choroplethFile.rows,
        choroplethIdCol,
        choroplethValueCol,
        choroplethMode: true,
        choroplethLayerVisible: true,
        choroplethGeoLevel: level !== 'unknown' ? level : undefined,
      }
      if (loadedGeo) patch.choroplethGeojson = loadedGeo

      patchBlockConfig(activeMapId, patch as Record<string, unknown>)
      setChoroplethFile(null)
      toast.success(t(language, 'choropleth.appliedSummary', { count: choroplethFile.rows.length, level: geoLevelLabel(language, level) }))
    } catch (err: unknown) {
      toast.dismiss('geo-load')
      toast.error(err instanceof Error ? err.message : t(language, 'choropleth.loadGeoError'))
    } finally {
      setIsApplying(false)
    }
  }

  const clearChoropleth = () => {
    if (!activeMapId) return
    setChoroplethFile(null)
    setDetectedLevel(null)
    setEditing(false)
    patchBlockConfig(activeMapId, {
      choroplethData: [], choroplethIdCol: '', choroplethValueCol: '',
      choroplethMode: false, choroplethGeojson: null,
    } as Record<string, unknown>)
    toast.info(t(language, 'choropleth.layerRemoved'))
  }

  const reloadGeoForLevel = async (level: GeoLevel) => {
    if (!activeMapId) return
    try {
      let loadedGeo: GeoJSON.FeatureCollection | null = null
      if (level === 'municipio') {
        const ufCodes = extractUFCodesFromMunicipios(cfg.choroplethData!, cfg.choroplethIdCol!)
        if (ufCodes.length === 0) { toast.error(t(language, 'choropleth.cannotExtractUf')); return }
        toast.loading(t(language, 'choropleth.loadingMunicipios', { count: ufCodes.length }), { id: 'geo-reload' })
        const fcs = await Promise.all(ufCodes.map((id) => ibgeApi.getGeoJSON('uf', id) as Promise<GeoJSON.FeatureCollection>))
        loadedGeo = mergeFeatureCollections(fcs)
        toast.success(t(language, 'choropleth.municipiosLoaded', { count: loadedGeo.features.length }), { id: 'geo-reload' })
      } else if (level === 'uf' || level === 'region') {
        toast.loading(t(language, 'choropleth.loadingBrazilMap'), { id: 'geo-reload' })
        loadedGeo = await ibgeApi.getGeoJSON('brasil') as GeoJSON.FeatureCollection
        toast.success(t(language, 'choropleth.brazilMapLoaded'), { id: 'geo-reload' })
      }
      if (loadedGeo) {
        patchBlockConfig(activeMapId, { choroplethGeojson: loadedGeo, choroplethGeoLevel: level } as Record<string, unknown>)
      }
    } catch (err: unknown) {
      toast.dismiss('geo-reload')
      toast.error(err instanceof Error ? err.message : t(language, 'choropleth.loadGeoError'))
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

  const choroplethIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
      <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
    </svg>
  )

  return (
    <LayerCard
      label={t(language, 'layers.choropleth')}
      sublabel={hasChoroplethData ? t(language, 'choropleth.recordsLevel', { count: cfg.choroplethData!.length, level: geoLevelLabel(language, detectedLevel || 'unknown') }) : t(language, 'choropleth.areaPlusValue')}
      hasData={hasChoroplethData}
      visible={choroplethVisible}
      open={open}
      icon={<div style={{ color: 'var(--accent)' }}>{choroplethIcon}</div>}
      onToggleOpen={() => setOpen(v => !v)}
      onToggleVisible={() => set({ choroplethLayerVisible: !choroplethVisible, choroplethMode: choroplethVisible ? false : hasChoroplethData })}
      onClear={hasChoroplethData ? clearChoropleth : undefined}
    >
      {!hasChoroplethData && !choroplethFile && (
        <div className="space-y-3 pt-1">
          <DropZone isDragging={isDragging} isUploading={isUploading}
            accept=".csv,.xlsx,.xls,.geojson,.json"
            hint={t(language, 'choropleth.uploadHint')}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleChoroplethFile(f) }}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onFile={handleChoroplethFile}
          />
        </div>
      )}

      {choroplethFile && (
        <div className="space-y-3 pt-1">
          <Stepper
            steps={[{ label: t(language, 'common.upload') }, { label: t(language, 'common.columns') }, { label: hasChoroplethData ? t(language, 'choropleth.reapply') : t(language, 'choropleth.apply') }]}
            activeStep={1}
          />

          <FileInfo name={t(language, 'choropleth.recordsCols', { count: choroplethFile.rows.length, cols: choroplethFile.columns.length })}
            onClear={() => { setChoroplethFile(null); setDetectedLevel(null) }} />

          <ColSelect label={t(language, 'choropleth.areaColumn')} value={choroplethIdCol} columns={choroplethFile.columns}
            onChange={(v) => {
              if (activeMapId) patchBlockConfig(activeMapId, { choroplethIdCol: v } as Record<string, unknown>)
              setDetectedLevel(v ? detectGeoLevel(choroplethFile.rows, v) : null)
            }} />

          {detectedLevel && (
            <div className="flex items-center gap-1.5 text-[11px] rounded-md px-2.5 py-1.5"
              style={{
                background: detectedLevel === 'unknown' ? 'var(--surface-muted)' : 'var(--accent-soft)',
                color: detectedLevel === 'unknown' ? 'var(--text-muted)' : 'var(--accent)',
                border: `1px solid ${detectedLevel === 'unknown' ? 'var(--border)' : 'var(--accent)'}`,
              }}>
              <span>{detectedLevel === 'unknown' ? '?' : '✓'}</span>
              <span>{detectedLevel === 'unknown'
                  ? t(language, 'choropleth.levelNotDetected')
                : `${geoLevelLabel(language, detectedLevel)} — ${t(language, 'choropleth.geoJsonAuto')}`}</span>
            </div>
          )}

          <ColSelect label={t(language, 'choropleth.valueColumn')} value={choroplethValueCol} columns={choroplethFile.columns}
            onChange={(v) => { if (activeMapId) patchBlockConfig(activeMapId, { choroplethValueCol: v } as Record<string, unknown>) }} />

          <div className="space-y-1.5">
            <label className="text-xs text-[var(--text-subtle)] font-medium">{t(language, 'choropleth.unitSuffix')}</label>
            <input type="text" value={choroplethUnit}
              onChange={(e) => set({ choroplethUnit: e.target.value })}
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-md px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-all"
              placeholder={t(language, 'choropleth.unitPlaceholder')} />
          </div>

          <button onClick={applyChoropleth}
            disabled={!choroplethIdCol || !choroplethValueCol || isApplying}
            className="w-full py-2 bg-[var(--accent)] hover:bg-[var(--accent-strong)] disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-md transition-all text-sm flex items-center justify-center gap-2">
            {isApplying && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {isApplying ? t(language, 'choropleth.loadingMap') : t(language, 'choropleth.apply')}
          </button>
        </div>
      )}

      {hasChoroplethData && !choroplethFile && (
        <div className="space-y-3 pt-1">
          <Stepper
            steps={[{ label: t(language, 'common.upload') }, { label: t(language, 'common.columns') }, { label: t(language, 'left.visual') }]}
            activeStep={2}
          />

          {editing ? (
            <div className="space-y-3">
              <ColSelect label={t(language, 'choropleth.areaColumn')} value={cfg.choroplethIdCol || ''} columns={Object.keys(cfg.choroplethData![0] || {})}
                onChange={(v) => {
                  if (!activeMapId) return
                  const level = v ? detectGeoLevel(cfg.choroplethData!, v) : null
                  setDetectedLevel(level)
                  patchBlockConfig(activeMapId, { choroplethIdCol: v, choroplethGeoLevel: level || undefined } as Record<string, unknown>)
                  if (level && level !== 'unknown') reloadGeoForLevel(level)
                }} />
              {detectedLevel && (
                <div className="flex items-center gap-1.5 text-[11px] rounded-md px-2.5 py-1.5"
                  style={{
                    background: detectedLevel === 'unknown' ? 'var(--surface-muted)' : 'var(--accent-soft)',
                    color: detectedLevel === 'unknown' ? 'var(--text-muted)' : 'var(--accent)',
                    border: `1px solid ${detectedLevel === 'unknown' ? 'var(--border)' : 'var(--accent)'}`,
                  }}>
                  <span>{detectedLevel === 'unknown' ? '?' : '✓'}</span>
                  <span>{detectedLevel === 'unknown'
                    ? t(language, 'choropleth.levelNotDetected')
                    : `${geoLevelLabel(language, detectedLevel)} — ${t(language, 'choropleth.geoJsonAuto')}`}</span>
                </div>
              )}
              <ColSelect label={t(language, 'choropleth.valueColumn')} value={cfg.choroplethValueCol || ''} columns={Object.keys(cfg.choroplethData![0] || {})}
                onChange={(v) => { if (activeMapId) patchBlockConfig(activeMapId, { choroplethValueCol: v } as Record<string, unknown>) }} />
              <button onClick={() => setEditing(false)}
                className="w-full py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-white font-semibold rounded-md transition-all text-sm">
                {t(language, 'common.done')}
              </button>
            </div>
          ) : (
            <>
              <div className="rounded-md border px-3 py-2 text-[11px] cursor-pointer hover:border-[var(--accent)] transition-colors"
                style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                onClick={() => {
                  setDetectedLevel(cfg.choroplethGeoLevel ? (cfg.choroplethGeoLevel as GeoLevel) : (cfg.choroplethIdCol ? detectGeoLevel(cfg.choroplethData!, cfg.choroplethIdCol) : null))
                  setEditing(true)
                }}>
                {t(language, 'choropleth.areaLabel')}: <strong style={{ color: 'var(--text)' }}>{cfg.choroplethIdCol}</strong>
                {' · '}{t(language, 'choropleth.valueLabel')}: <strong style={{ color: 'var(--text)' }}>{cfg.choroplethValueCol}</strong>
                <span className="ml-1 text-[10px]" style={{ color: 'var(--accent)' }}>{t(language, 'common.clickToEdit')}</span>
              </div>
              {(() => {
                const dataRows = cfg.choroplethData || []
                const idCol = cfg.choroplethIdCol || ''
                const valCol = cfg.choroplethValueCol || ''
                const numericCount = idCol && valCol ? dataRows.filter(r => !isNaN(Number(r[valCol]))).length : 0
                if (!idCol || !valCol) return (
                  <div className="text-[10px] rounded-md px-2.5 py-1.5"
                    style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}>
                    {t(language, 'choropleth.selectAreaAndValueToView')}
                  </div>
                )
                if (numericCount === 0) return (
                  <div className="text-[10px] rounded-md px-2.5 py-1.5"
                    style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.25)' }}>
                    {t(language, 'choropleth.valueColNoNumbers', { col: valCol })}
                  </div>
                )
                if (numericCount < dataRows.length) return (
                  <div className="text-[10px] rounded-md px-2.5 py-1.5"
                    style={{ background: 'rgba(234,179,8,0.1)', color: '#ca8a04', border: '1px solid rgba(234,179,8,0.25)' }}>
                    {t(language, 'choropleth.validNumericRecords', { valid: numericCount, total: dataRows.length })}
                  </div>
                )
                return (
                  <div className="text-[10px] rounded-md px-2.5 py-1.5"
                    style={{ background: 'rgba(34,197,94,0.1)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.25)' }}>
                    {t(language, 'choropleth.readyRecords', { count: numericCount })}
                  </div>
                )
              })()}
            </>
          )}

          <SectionLabel>{t(language, 'choropleth.colorPalette')}</SectionLabel>
          <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
            {CHOROPLETH_PALETTES.map((p) => {
              const active = choroplethPalette === p.id
              return (
                <button key={p.id} onClick={() => set({ choroplethPalette: p.id })}
                  className="w-full flex items-center gap-2 rounded-md border px-2 py-1.5 transition-all"
                  style={{
                    borderColor: active ? 'var(--accent)' : 'var(--border)',
                    background: active ? 'var(--accent-soft)' : 'var(--surface)',
                  }}>
                  <div className="flex gap-0.5 flex-shrink-0">
                    {p.colors.slice(0, 6).map((c, i) => (
                      <div key={i} className="w-3 h-3 rounded-sm" style={{ background: c }} />
                    ))}
                  </div>
                  <span className="text-[11px] font-semibold" style={{ color: active ? 'var(--accent)' : 'var(--text)' }}>
                    {p.label}
                  </span>
                </button>
              )
            })}
            <button onClick={() => set({ choroplethPalette: 'custom' })}
              className="w-full flex items-center gap-2 rounded-md border px-2 py-1.5 transition-all"
              style={{
                borderColor: choroplethPalette === 'custom' ? 'var(--accent)' : 'var(--border)',
                background: choroplethPalette === 'custom' ? 'var(--accent-soft)' : 'var(--surface)',
              }}>
              <div className="flex gap-0.5 flex-shrink-0">
                <div className="w-3 h-3 rounded-sm" style={{ background: cfg.choroplethCustomStart || '#e8f0fe' }} />
                <div className="w-3 h-3 rounded-sm" style={{ background: 'var(--text-subtle)', opacity: 0.15 }} />
                <div className="w-3 h-3 rounded-sm" style={{ background: cfg.choroplethCustomEnd || '#1e40af' }} />
              </div>
              <span className="text-[11px] font-semibold" style={{ color: choroplethPalette === 'custom' ? 'var(--accent)' : 'var(--text)' }}>
                {t(language, 'choropleth.custom')}
              </span>
            </button>
          </div>

          {choroplethPalette === 'custom' && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] text-[var(--text-subtle)]">{t(language, 'choropleth.startColor')}</label>
                <input type="color" value={cfg.choroplethCustomStart || '#e8f0fe'}
                  onChange={(e) => set({ choroplethCustomStart: e.target.value })}
                  className="w-full h-8 rounded-md border border-[var(--border)] cursor-pointer p-0.5 bg-[var(--surface)]" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-[var(--text-subtle)]">{t(language, 'choropleth.endColor')}</label>
                <input type="color" value={cfg.choroplethCustomEnd || '#1e40af'}
                  onChange={(e) => set({ choroplethCustomEnd: e.target.value })}
                  className="w-full h-8 rounded-md border border-[var(--border)] cursor-pointer p-0.5 bg-[var(--surface)]" />
              </div>
            </div>
          )}

          <SectionLabel>{t(language, 'choropleth.colorRange')}</SectionLabel>
          <div className="grid grid-cols-3 gap-1.5">
            {([3, 5, 7] as const).map((n) => {
              const active = choroplethClasses === n
              return (
                <button key={n} onClick={() => set({ choroplethClasses: n })}
                  className="rounded-md border py-1.5 text-[11px] font-semibold transition-all"
                  style={{
                    borderColor: active ? 'var(--accent)' : 'var(--border)',
                    background: active ? 'var(--accent-soft)' : 'var(--surface)',
                    color: active ? 'var(--accent)' : 'var(--text)',
                  }}>
                  {t(language, 'choropleth.bands', { count: n })}
                </button>
              )
            })}
          </div>

          <div className="space-y-1.5">
            <label className="text-xs text-[var(--text-subtle)] font-medium">{t(language, 'choropleth.unitSuffix')}</label>
            <input type="text" value={choroplethUnit}
              onChange={(e) => set({ choroplethUnit: e.target.value })}
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-md px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-all"
              placeholder={t(language, 'choropleth.unitPlaceholder')} />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] text-[var(--text-subtle)]">{t(language, 'choropleth.legendTitle')}</label>
            <input type="text" value={cfg.choroplethLegendTitle || ''}
              onChange={(e) => set({ choroplethLegendTitle: e.target.value })}
              className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-md px-2 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)] transition-all"
              placeholder={t(language, 'choropleth.legendTitlePlaceholder')} />
          </div>

          <button onClick={() => { setEditing(false); setChoroplethFile({ name: t(language, 'choropleth.reloadFile'), rows: cfg.choroplethData!, columns: Object.keys(cfg.choroplethData![0] || {}) }) }}
            className="w-full py-1.5 rounded-md border text-[11px] font-semibold transition-colors"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
            {t(language, 'choropleth.replaceFile')}
          </button>
        </div>
      )}
    </LayerCard>
  )
}
