import { useEffect, useMemo, useRef, useCallback } from 'react'
import { useAppStore } from '../../stores/appStore'
import { t } from '../../i18n'
import { useStudioStore } from '../../studio/store/studioStore'
import { useRegions, useUfs, useMunicipios } from '../../hooks/useMapData'
import { ibgeApi, geoApi } from '../../services/api'
import { RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import type { MapBlockConfig, BaseMapKind } from '../../studio/types'

const BASEMAPS: { value: BaseMapKind; key: string }[] = [
  { value: 'none', key: 'maptab.basemap.none' },
  { value: 'road', key: 'maptab.basemap.road' },
  { value: 'terrain', key: 'maptab.basemap.terrain' },
  { value: 'satellite', key: 'maptab.basemap.satellite' },
  { value: 'dark', key: 'maptab.basemap.dark' },
]

function useActiveMap() {
  const { spec, activeMapId, patchBlockConfig } = useStudioStore()
  const block = useMemo(
    () => (activeMapId && spec ? spec.blocks.find((b) => b.id === activeMapId) || null : null),
    [spec, activeMapId]
  )
  const config = (block?.config || {}) as MapBlockConfig
  const set = useCallback((patch: Partial<MapBlockConfig>) => {
    if (activeMapId) patchBlockConfig(activeMapId, patch as Record<string, unknown>)
  }, [activeMapId, patchBlockConfig])
  return { block, config, activeMapId, set }
}

export default function MapTab() {
  const { config: mapCfg, activeMapId, set } = useActiveMap()
  const { setLoading, language } = useAppStore()

  const area = mapCfg.area || { type: 'brasil' }
  const areaType = area.type as 'brasil' | 'region' | 'uf' | 'municipio'
  const regionId = area.regionId ?? (areaType === 'region' ? area.id ?? null : null)
  const ufId = area.ufId ?? (areaType === 'uf' ? area.id ?? null : null)
  const municipioId = area.municipioId ?? (areaType === 'municipio' ? area.id ?? null : null)

  const { data: regions = [], isLoading: loadingRegions } = useRegions()
  const { data: ufs = [], isLoading: loadingUfs } = useUfs(areaType === 'region' ? area.id ?? undefined : undefined)
  const { data: municipios = [], isLoading: loadingMun } = useMunicipios(areaType === 'uf' ? area.id ?? undefined : undefined)

  const lastLoadKey = useRef('')

  useEffect(() => {
    if (!activeMapId) return
    const key = `${activeMapId}:${areaType}:${area.id ?? ''}`
    if (lastLoadKey.current === key) return
    lastLoadKey.current = key
    const load = async () => {
      setLoading(true)
      try {
        const data = await ibgeApi.getGeoJSON(areaType, (area.id as number | null) ?? null)
        set({ geojson: data })
        } catch {
          toast.error(t(language, 'maptab.errorLoadMap'))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [activeMapId, areaType, area.id, set, setLoading])

  useEffect(() => {
    if (!activeMapId || !mapCfg.geojson || !mapCfg.rawPoints || mapCfg.rawPoints.length === 0) return
    const reFilter = async () => {
      try {
        const result = await geoApi.filterPoints(mapCfg.rawPoints!, mapCfg.geojson!)
        set({ markers: result.filtered_points })
      } catch { /* ignore */ }
    }
    reFilter()
  }, [activeMapId, mapCfg.geojson, set, mapCfg.rawPoints])

  useEffect(() => {
    if (!activeMapId) return
    const update = async () => {
      try {
        if (areaType === 'municipio' && area.id) set({ areaName: await ibgeApi.getAreaName('municipio', area.id) })
        else if (areaType === 'uf' && area.id) set({ areaName: await ibgeApi.getAreaName('uf', area.id) })
        else if (areaType === 'region' && area.id) set({ areaName: await ibgeApi.getAreaName('region', area.id) })
         else set({ areaName: t(language, 'maptab.brazil') })
      } catch { /* ignore */ }
    }
    update()
  }, [activeMapId, areaType, area.id, set])

  const setRegion = (id: number | null) => {
    set({ area: id ? { type: 'region', id, regionId: id, ufId: null, municipioId: null } : { type: 'brasil', regionId: null, ufId: null, municipioId: null } })
  }
  const setUf = (id: number | null) => {
    set({ area: id ? { type: 'uf', id, regionId, ufId: id, municipioId: null } : (regionId ? { type: 'region', id: regionId, regionId, ufId: null, municipioId: null } : { type: 'brasil', regionId: null, ufId: null, municipioId: null }) })
  }
  const setMunicipio = (id: number | null) => {
    set({ area: id ? { type: 'municipio', id, regionId, ufId, municipioId: id } : (ufId ? { type: 'uf', id: ufId, regionId, ufId, municipioId: null } : (regionId ? { type: 'region', id: regionId, regionId, ufId: null, municipioId: null } : { type: 'brasil', regionId: null, ufId: null, municipioId: null })) })
  }

  const handleReset = () => {
    set({ area: { type: 'brasil' }, areaName: t(language, 'maptab.brazil'), featureColors: {} })
  }

  const baseMap = mapCfg.basemap || 'none'

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
      <div className="flex items-center justify-between">
        <h3 className="text-[var(--text)] font-semibold text-sm">{t(language, 'maptab.areaOf')} {mapCfg.name || t(language, 'left.map').toLowerCase()}</h3>
        {(regionId || ufId || municipioId) && (
          <button onClick={handleReset}
            className="text-xs text-[var(--text-subtle)] hover:text-[var(--text)] flex items-center gap-1 transition-colors">
            <RotateCcw size={12} />
            {t(language, 'common.clear')}
          </button>
        )}
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs text-[var(--text-subtle)] font-medium">{t(language, 'maptab.country')}</label>
          <div className="bg-[var(--surface-muted)] border border-[var(--border)] rounded-md px-3 py-2 text-sm text-[var(--text)]">{t(language, 'maptab.brazil')}</div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-[var(--text-subtle)] font-medium">{t(language, 'maptab.region')}</label>
          <select value={regionId ?? ''}
            onChange={(e) => setRegion(e.target.value ? parseInt(e.target.value) : null)}
            disabled={loadingRegions}
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-md px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-soft)] transition-all appearance-none cursor-pointer disabled:opacity-50">
            <option value="">{t(language, 'maptab.allRegions')}</option>
            {regions.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-[var(--text-subtle)] font-medium">{t(language, 'maptab.state')}</label>
          <select value={ufId ?? ''}
            onChange={(e) => setUf(e.target.value ? parseInt(e.target.value) : null)}
            disabled={!regionId || loadingUfs}
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-md px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-soft)] transition-all appearance-none cursor-pointer disabled:opacity-50">
            <option value="">{t(language, 'maptab.allStates')}</option>
            {ufs.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-[var(--text-subtle)] font-medium">{t(language, 'maptab.city')}</label>
          <select value={municipioId ?? ''}
            onChange={(e) => setMunicipio(e.target.value ? parseInt(e.target.value) : null)}
            disabled={!ufId || loadingMun}
            className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-md px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent-soft)] transition-all appearance-none cursor-pointer disabled:opacity-50">
            <option value="">{t(language, 'maptab.allCities')}</option>
            {municipios.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-[var(--text-subtle)] font-medium">{t(language, 'maptab.basemap')}</label>
        <select value={baseMap}
          onChange={(e) => set({ basemap: e.target.value as MapBlockConfig['basemap'] })}
          className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-md px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] cursor-pointer">
          {BASEMAPS.map((b) => <option key={b.value} value={b.value}>{t(language, b.key)}</option>)}
        </select>
      </div>

      <div className="bg-[var(--accent-soft)] border border-[var(--border)] rounded-md p-3">
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          {t(language, 'maptab.affectOnly')} <strong>{mapCfg.name || t(language, 'maptab.activeMap')}</strong>. {t(language, 'maptab.otherMapsKeep')}
        </p>
      </div>
    </div>
  )
}
