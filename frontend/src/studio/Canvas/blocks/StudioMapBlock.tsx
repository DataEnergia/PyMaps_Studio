import { useEffect, useRef, useState, memo, useCallback, useMemo } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { toPng } from 'html-to-image'
import { Crosshair, Star } from 'lucide-react'
import { useStudioStore } from '../../store/studioStore'
import { useAppStore } from '../../../stores/appStore'
import type { Block, MapBlockConfig, ChoroplethRow, GeoJsonLayer, PointLayer } from '../../types'
import { getIconByName, tintSvg } from '../../../lib/mapIcons'
import { makeQuintilScale, joinChoropleth, getPaletteColors } from '../../../utils/colorScale'
import { t } from '../../../i18n'

interface Props {
  block: Block
  isSelected: boolean
}

/** IBGE UF code → IBGE Region ID mapping (used to filter choropleth when area changes). */
const UF_REGION: Record<number, number> = {
  11:1, 12:1, 13:1, 14:1, 15:1, 16:1, 17:1,                   // Norte
  21:2, 22:2, 23:2, 24:2, 25:2, 26:2, 27:2, 28:2, 29:2,       // Nordeste
  31:3, 32:3, 33:3, 35:3,                                       // Sudeste
  41:4, 42:4, 43:4,                                             // Sul
  50:5, 51:5, 52:5, 53:5,                                       // Centro-Oeste
}

/** Static UF label data — approximate geographic centroids for state abbreviation overlay.
 *  Independent of GeoJSON area type so labels appear for any zoom level. */
export const UF_LABEL_DATA: { id: number; sigla: string; lon: number; lat: number }[] = [
  { id: 12, sigla: 'AC', lon: -70.5, lat: -9.2  },
  { id: 27, sigla: 'AL', lon: -36.6, lat: -9.6  },
  { id: 16, sigla: 'AP', lon: -51.3, lat:  1.4  },
  { id: 13, sigla: 'AM', lon: -65.0, lat: -4.0  },
  { id: 29, sigla: 'BA', lon: -41.7, lat: -12.9 },
  { id: 23, sigla: 'CE', lon: -39.6, lat: -5.2  },
  { id: 53, sigla: 'DF', lon: -47.9, lat: -15.8 },
  { id: 32, sigla: 'ES', lon: -40.7, lat: -19.6 },
  { id: 52, sigla: 'GO', lon: -49.7, lat: -15.9 },
  { id: 21, sigla: 'MA', lon: -45.3, lat: -4.9  },
  { id: 51, sigla: 'MT', lon: -55.9, lat: -12.9 },
  { id: 50, sigla: 'MS', lon: -54.7, lat: -20.5 },
  { id: 31, sigla: 'MG', lon: -44.7, lat: -18.4 },
  { id: 15, sigla: 'PA', lon: -52.0, lat: -3.7  },
  { id: 25, sigla: 'PB', lon: -36.8, lat: -7.1  },
  { id: 41, sigla: 'PR', lon: -51.6, lat: -24.7 },
  { id: 26, sigla: 'PE', lon: -37.9, lat: -8.4  },
  { id: 22, sigla: 'PI', lon: -42.8, lat: -7.6  },
  { id: 33, sigla: 'RJ', lon: -43.0, lat: -22.3 },
  { id: 24, sigla: 'RN', lon: -36.9, lat: -5.8  },
  { id: 43, sigla: 'RS', lon: -53.2, lat: -30.0 },
  { id: 11, sigla: 'RO', lon: -62.8, lat: -11.0 },
  { id: 14, sigla: 'RR', lon: -61.0, lat:  2.0  },
  { id: 42, sigla: 'SC', lon: -50.5, lat: -27.3 },
  { id: 28, sigla: 'SE', lon: -37.4, lat: -10.6 },
  { id: 35, sigla: 'SP', lon: -48.5, lat: -22.2 },
  { id: 17, sigla: 'TO', lon: -48.2, lat: -10.2 },
]

const BASEMAP_URLS: Record<string, string> = {
  road: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  terrain: 'https://a.tile.opentopomap.org/{z}/{x}/{y}.png',
  satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  dark: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
}

const PALETTE = [
  '#2d3742', '#1B5E20', '#0D47A1', '#B71C1C', '#E65100',
  '#F9A825', '#6A1B9A', '#00695C', '#37474F', '#5D4037',
  '#880E4F', '#3E2723', '#E09A3A', '#4A7AA4', '#8F6B2A',
  '#FF0000', '#00FF00', '#0000FF', '#FFA500', '#800080',
]

interface PopupState {
  visible: boolean
  x: number
  y: number
  featureId: string
  featureName: string
  featureValue?: number
}

/* Geographic centroid helpers (used for HTML label positioning). */
function geoRingCentroid(ring: number[][]): [number, number] {
  let sx = 0, sy = 0
  for (const pt of ring) { sx += pt[0]; sy += pt[1] }
  return [sx / ring.length, sy / ring.length]
}

function geoFeatureCentroid(f: GeoJSON.Feature): [number, number] | null {
  const g = f.geometry
  if (!g) return null
  if (g.type === 'Polygon') return geoRingCentroid((g as GeoJSON.Polygon).coordinates[0] as number[][])
  if (g.type === 'MultiPolygon') {
    const rings = ((g as GeoJSON.MultiPolygon).coordinates as number[][][][]).map((p) => p[0])
    const largest = rings.reduce((a, b) => (a.length >= b.length ? a : b), rings[0] || [])
    return geoRingCentroid(largest)
  }
  return null
}

/* Outer boundary extraction: collect all edges that appear exactly once (shared edges cancel out). */
function extractOuterEdges(fc: GeoJSON.FeatureCollection): GeoJSON.Position[][] {
  const edgeCount = new Map<string, number>()
  const edgeData = new Map<string, GeoJSON.Position[]>()
  const toKey = (p: GeoJSON.Position) => `${(p[0] as number).toFixed(6)},${(p[1] as number).toFixed(6)}`
  const addEdge = (a: GeoJSON.Position, b: GeoJSON.Position) => {
    const ka = toKey(a); const kb = toKey(b)
    const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
    edgeCount.set(key, (edgeCount.get(key) || 0) + 1)
    if (!edgeData.has(key)) edgeData.set(key, [a, b])
  }
  const processRing = (ring: GeoJSON.Position[]) => {
    for (let i = 0; i < ring.length - 1; i++) addEdge(ring[i], ring[i + 1])
  }
  for (const f of fc.features) {
    const g = f.geometry
    if (!g) continue
    if (g.type === 'Polygon') { for (const r of (g as GeoJSON.Polygon).coordinates) processRing(r) }
    else if (g.type === 'MultiPolygon') { for (const p of (g as GeoJSON.MultiPolygon).coordinates) for (const r of p) processRing(r) }
  }
  const result: GeoJSON.Position[][] = []
  for (const [key, count] of edgeCount) { if (count === 1) result.push(edgeData.get(key)!) }
  return result
}

/* Normalize GeoJSON: ensure every feature has a top-level string id for MapLibre feature-state. */
function normalizeGeoJSON(raw: unknown): {
  geojson: GeoJSON.FeatureCollection
  nameMap: Record<string, string>
} {
  const fc = raw as GeoJSON.FeatureCollection
  const nameMap: Record<string, string> = {}
  let nextId = 1

  const features = fc.features.map((f) => {
    const p = f.properties as Record<string, unknown> | undefined

    // Primary ID: try IBGE standard codes first, then fallbacks (including top-level f.id)
    let id: string | undefined
    if (p?.CD_MUN) id = String(p.CD_MUN)
    else if (p?.codigo_ibg || p?.codigo_ibge) id = String(p.codigo_ibg || p.codigo_ibge)
    else if (p?.codarea) id = String(p.codarea)
    else if (p?.CD_UF) id = String(p.CD_UF)
    else if (p?.id !== undefined && p?.id !== null) id = String(p.id)
    else if (f.id !== undefined && f.id !== null) id = String(f.id)
    if (!id) id = String(nextId++)

    const name = String(p?.NM_MUN || p?.nome || p?.NM_UF || p?.name || `Área ${id}`)
    nameMap[id] = name

    // Also index by sigla (state abbreviation) and numeric code so joinChoropleth can match
    const sigla = p?.sigla || p?.SIGLA || p?.SIGLA_UF
    if (sigla && typeof sigla === 'string') {
      nameMap[sigla] = name
      nameMap[sigla.toUpperCase()] = name
    }
    // Index by 2-digit code (useful when user data has Cod_IBGE = 35 but geojson has codigo_ibg = "35")
    if (p?.codigo_ibg || p?.codigo_ibge || p?.CD_UF) {
      const code = String(p.codigo_ibg || p.codigo_ibge || p.CD_UF || '')
      if (code) nameMap[code] = name
    }

    return { ...f, id } as GeoJSON.Feature
  })

  return { geojson: { ...fc, features } as GeoJSON.FeatureCollection, nameMap }
}

/** Ray-casting point-in-polygon test for a single coordinate ring. */
function pointInRing(lon: number, lat: number, ring: GeoJSON.Position[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0] as number, yi = ring[i][1] as number
    const xj = ring[j][0] as number, yj = ring[j][1] as number
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

/** Test if [lon, lat] is inside any polygon feature of a boundary FeatureCollection. */
function pointInBoundary(lon: number, lat: number, boundary: GeoJSON.FeatureCollection): boolean {
  for (const f of boundary.features) {
    const g = f.geometry
    if (!g) continue
    if (g.type === 'Polygon') {
      if (pointInRing(lon, lat, (g as GeoJSON.Polygon).coordinates[0])) return true
    } else if (g.type === 'MultiPolygon') {
      for (const poly of (g as GeoJSON.MultiPolygon).coordinates) {
        if (pointInRing(lon, lat, poly[0] as GeoJSON.Position[])) return true
      }
    }
  }
  return false
}

/** Approximate centroid [lon, lat] of any GeoJSON geometry (used for polygon/line area filtering). */
function geometryCentroid(g: GeoJSON.Geometry): [number, number] | null {
  if (g.type === 'Point') return [(g as GeoJSON.Point).coordinates[0], (g as GeoJSON.Point).coordinates[1]]
  if (g.type === 'MultiPoint') {
    const c = (g as GeoJSON.MultiPoint).coordinates as number[][]
    if (!c.length) return null
    const s = c.reduce((a, b) => [a[0] + b[0], a[1] + b[1]], [0, 0])
    return [s[0] / c.length, s[1] / c.length] as [number, number]
  }
  if (g.type === 'LineString') {
    const c = (g as GeoJSON.LineString).coordinates
    const mid = Math.floor(c.length / 2)
    return [c[mid][0], c[mid][1]] as [number, number]
  }
  if (g.type === 'MultiLineString') {
    const all = (g as GeoJSON.MultiLineString).coordinates.flat() as number[][]
    if (!all.length) return null
    return [all[Math.floor(all.length / 2)][0], all[Math.floor(all.length / 2)][1]] as [number, number]
  }
  if (g.type === 'Polygon') return geoRingCentroid((g as GeoJSON.Polygon).coordinates[0] as number[][])
  if (g.type === 'MultiPolygon') {
    const rings = ((g as GeoJSON.MultiPolygon).coordinates as number[][][][]).map(p => p[0])
    const largest = rings.reduce((a, b) => (a.length >= b.length ? a : b), rings[0] || [])
    return geoRingCentroid(largest)
  }
  return null
}

const StudioMapBlockInner = memo(function StudioMapBlockInner({ block, isSelected }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const readyRef = useRef(false)
  const normGeojsonRef = useRef<GeoJSON.FeatureCollection | null>(null)
  const nameMapRef = useRef<Record<string, string>>({})
  const [nameMapState, setNameMapState] = useState<Record<string, string>>({})

  // Separate refs/state for the choropleth GeoJSON (stored in cfg.choroplethGeojson)
  const choroplethNormRef = useRef<GeoJSON.FeatureCollection | null>(null)
  const choroplethNameMapRef = useRef<Record<string, string>>({})
  const [choroplethNameMapState, setChoroplethNameMapState] = useState<Record<string, string>>({})
  const [fullChoroplethNameMap, setFullChoroplethNameMap] = useState<Record<string, string>>({})
  const hoveredRef = useRef<string | null>(null)

  const { activeMapId, setActiveMapId, patchBlockConfig } = useStudioStore()
  const { language } = useAppStore()
  const config = (block.config || {}) as MapBlockConfig
  const isActive = activeMapId === block.id

  const featureColors = config.featureColors || {}
  const featureColorsRef = useRef<Record<string, string>>(featureColors)
  featureColorsRef.current = featureColors

  const fillColor = config.fillColor || '#2d3742'
  const borderColor = config.borderColor || '#7a8a9a'
  const borderWidth = config.borderWidth ?? 1
  const fillOpacity = config.fillOpacity ?? 0.85
  const markerColor = config.markerColor || '#d9822b'
  const markerSize = config.markerSize ?? 3
  const markerStrokeWidth = config.markerStrokeWidth ?? 0.8
  const markerStrokeColor = config.markerStrokeColor || '#ffffff'
  const markerIcon = config.markerIcon
  const markerIconColor = config.markerIconColor || markerColor
  const markerStyle = config.markerStyle || 'circle'
  const baseMap = config.basemap || 'none'
  const showStateLabels = config.showStateLabels !== false
  const stateLabelColor = config.stateLabelColor || '#ffffff'
  const stateLabelSize = config.stateLabelSize || 12
  const showInternalBorders = config.showInternalBorders !== false
  const showOuterBorder = config.showOuterBorder ?? false
  const outerBorderColor = config.outerBorderColor || '#ffffff'
  const outerBorderWidth = config.outerBorderWidth ?? 2
  const markers = config.markers || []
  const geojson = config.geojson
  const choroplethGeojson = config.choroplethGeojson
  const choroplethLayerVisible = config.choroplethLayerVisible !== false
  const pointsLayerVisible = config.pointsLayerVisible !== false

  const choroplethMode = config.choroplethMode || false
  const choroplethData = (config.choroplethData || []) as ChoroplethRow[]
  const choroplethIdCol = config.choroplethIdCol || ''
  const choroplethValueCol = config.choroplethValueCol || ''
  const choroplethGeoLevel = config.choroplethGeoLevel
  const geoJsonLayers = (config.geoJsonLayers || []) as GeoJsonLayer[]
  const pointLayers = (config.pointLayers || []) as PointLayer[]
  const choroplethPalette = config.choroplethPalette || 'blue'
  const choroplethUnit = config.choroplethUnit || ''
  const choroplethClasses = config.choroplethClasses || 5
  const showChoroplethLegend = config.showChoroplethLegend !== false
  const choroplethLegendTitle = config.choroplethLegendTitle || ''

  // Filter choropleth GeoJSON to only features matching the current area.
  // choroplethGeojson always stores the FULL dataset; this is just a display filter.
  // Strategy: code-based filter when geoLevel is known (fast, no timing dependency);
  // spatial centroid filter as fallback when geoLevel is unknown/undetected.
  const filteredChoroplethGeojson = useMemo(() => {
    const geo = choroplethGeojson as GeoJSON.FeatureCollection | null | undefined
    if (!geo?.features?.length) return choroplethGeojson
    const area = config.area || { type: 'brasil' }
    if (area.type === 'brasil' || !area.id) return choroplethGeojson

    const getFeatureCode = (f: GeoJSON.Feature): string => {
      const p = f.properties as Record<string, unknown> | undefined
      const fromProps = String(p?.CD_MUN ?? p?.codigo_ibg ?? p?.codigo_ibge ?? p?.codarea ?? p?.CD_UF ?? p?.id ?? '')
      if (fromProps && fromProps !== 'undefined' && fromProps !== 'null') return fromProps
      if (f.id !== undefined && f.id !== null) return String(f.id)
      return ''
    }

    // Code-based filter — works immediately without boundary GeoJSON
    if (choroplethGeoLevel) {
      const areaId = area.id as number
      const filtered = geo.features.filter((f) => {
        const rawCode = getFeatureCode(f)
        if (!rawCode || rawCode === 'undefined' || rawCode === 'null') return true

        if (choroplethGeoLevel === 'municipio') {
          const ufCode = parseInt(rawCode.substring(0, 2), 10)
          if (area.type === 'uf') return ufCode === areaId
          if (area.type === 'region') return UF_REGION[ufCode] === areaId
          if (area.type === 'municipio') return rawCode === String(areaId)
        } else if (choroplethGeoLevel === 'uf') {
          const ufCode = parseInt(rawCode, 10)
          if (area.type === 'uf') return ufCode === areaId
          if (area.type === 'region') return UF_REGION[ufCode] === areaId
          if (area.type === 'municipio') {
            const munUfCode = Math.floor(areaId / 100000)
            return ufCode === munUfCode
          }
        } else if (choroplethGeoLevel === 'region') {
          const regionCode = parseInt(rawCode, 10)
          if (area.type === 'region') return regionCode === areaId
        }
        return true
      })
      return { ...geo, features: filtered }
    }

    // Spatial fallback — when geoLevel wasn't detected (e.g. CSV uses state names).
    // Uses centroid-in-boundary test, same approach as geoJsonLayers/pointLayers.
    const boundary = geojson as GeoJSON.FeatureCollection | null | undefined
    if (boundary?.features?.length) {
      const filtered = geo.features.filter((f) => {
        if (!f.geometry) return false
        const c = geometryCentroid(f.geometry)
        return c ? pointInBoundary(c[0], c[1], boundary) : true
      })
      return { ...geo, features: filtered }
    }

    return choroplethGeojson
  }, [choroplethGeojson, choroplethGeoLevel, config.area, geojson])

  // Filter custom GeoJSON layers to features within the current area boundary.
  // Original config.geoJsonLayers data is never modified — this is display-only.
  const filteredGeoJsonLayers = useMemo(() => {
    const area = config.area || { type: 'brasil' }
    const boundary = geojson as GeoJSON.FeatureCollection | null | undefined
    if (area.type === 'brasil' || !area.id || !boundary?.features?.length) return geoJsonLayers
    return geoJsonLayers.map((layer) => {
      const fc = layer.geojson as GeoJSON.FeatureCollection | null | undefined
      if (!fc?.features?.length) return layer
      const features = fc.features.filter((f) => {
        const g = f.geometry
        if (!g) return false
        if (g.type === 'Point') {
          const [lon, lat] = (g as GeoJSON.Point).coordinates as number[]
          return pointInBoundary(lon, lat, boundary)
        }
        if (g.type === 'MultiPoint') {
          return ((g as GeoJSON.MultiPoint).coordinates as number[][]).some(
            ([lon, lat]) => pointInBoundary(lon, lat, boundary)
          )
        }
        const c = geometryCentroid(g)
        return c ? pointInBoundary(c[0], c[1], boundary) : true
      })
      return { ...layer, geojson: { ...fc, features } }
    })
  }, [geoJsonLayers, geojson, config.area])

  // Filter custom point layers to points within the current area boundary.
  // When filterByArea is true, re-filter from rawPoints against the new boundary
  // so that switching areas always shows all points that belong to the new area.
  const filteredPointLayers = useMemo(() => {
    const area = config.area || { type: 'brasil' }
    const boundary = geojson as GeoJSON.FeatureCollection | null | undefined
    if (area.type === 'brasil' || !area.id || !boundary?.features?.length) return pointLayers
    return pointLayers.map((layer) => {
      const source = layer.filterByArea && layer.rawPoints?.length ? layer.rawPoints : layer.points
      return {
        ...layer,
        points: (source || []).filter((pt) => pointInBoundary(pt.lon, pt.lat, boundary)),
      }
    })
  }, [pointLayers, geojson, config.area])

  // Unified legend
  const showLegend = config.showLegend !== false
  const legendX = config.legendX ?? 0.02
  const legendY = config.legendY ?? 0.65
  const legendScale = config.legendScale ?? 1.0
  const legendBg = config.legendBg ?? 'transparent'
  const showPointsLegend = config.showPointsLegend !== false
  const pointsLegendLabel = config.pointsLegendLabel || 'Pontos'

  /* Refs for snapshot to avoid stale closures */
  const fillColorRef = useRef(fillColor)
  const borderColorRef = useRef(borderColor)
  const borderWidthRef = useRef(borderWidth)
  const fillOpacityRef = useRef(fillOpacity)
  const markerColorRef = useRef(markerColor)
  const markerSizeRef = useRef(markerSize)
  const markerStrokeWidthRef = useRef(markerStrokeWidth)
  const markerStrokeColorRef = useRef(markerStrokeColor)
  const baseMapRef = useRef(baseMap)
  const markersRef = useRef(markers)
  const markerIconRef = useRef(markerIcon)
  const markerIconColorRef = useRef(markerIconColor)
  const markerStyleRef = useRef(markerStyle)
  const showStateLabelsRef = useRef(showStateLabels)
  const stateLabelColorRef = useRef(stateLabelColor)
  const stateLabelSizeRef = useRef(stateLabelSize)
  const showInternalBordersRef = useRef(showInternalBorders)
  const showOuterBorderRef = useRef(showOuterBorder)
  const outerBorderColorRef = useRef(outerBorderColor)
  const outerBorderWidthRef = useRef(outerBorderWidth)
  const stateLabelPositionsRef = useRef<Record<string, { x: number; y: number }>>(config.stateLabelPositions || {})
  const htmlMarkersRef = useRef<maplibregl.Marker[]>([])
  const pointHtmlMarkersRef = useRef<maplibregl.Marker[]>([])
  const geoJsonMarkersRef = useRef<maplibregl.Marker[]>([])
  const geoCentersRef = useRef<Record<string, [number, number]>>({})
  const labelRafRef = useRef<number | null>(null)
  const areaRef = useRef(config.area || { type: 'brasil' })

  // Choropleth + legend config refs — must be kept in sync every render because
  // getSnapshot() is a stale closure (created once at map init).
  const choroplethModeRef = useRef(choroplethMode)
  const choroplethPaletteRef = useRef(choroplethPalette)
  const showChoroplethLegendRef = useRef(showChoroplethLegend)
  const choroplethLegendTitleRef = useRef(choroplethLegendTitle)
  const choroplethLayerVisibleRef = useRef(choroplethLayerVisible)
  const geoJsonLayersRef = useRef(geoJsonLayers)
  const pointLayersRef = useRef<PointLayer[]>([])
  const pointsLayerVisibleRef = useRef(pointsLayerVisible)
  const showLegendRef = useRef(showLegend)
  const legendXRef = useRef(legendX)
  const legendYRef = useRef(legendY)
  const legendScaleRef = useRef(legendScale)
  const legendBgRef = useRef(legendBg)
  const showPointsLegendRef = useRef(showPointsLegend)
  const pointsLegendLabelRef = useRef(pointsLegendLabel)

  // Sync all refs every render
  fillColorRef.current = fillColor
  borderColorRef.current = borderColor
  borderWidthRef.current = borderWidth
  fillOpacityRef.current = fillOpacity
  markerColorRef.current = markerColor
  markerSizeRef.current = markerSize
  markerStrokeWidthRef.current = markerStrokeWidth
  markerStrokeColorRef.current = markerStrokeColor
  baseMapRef.current = baseMap
  markersRef.current = markers
  markerIconRef.current = markerIcon
  markerIconColorRef.current = markerIconColor
  markerStyleRef.current = markerStyle
  showStateLabelsRef.current = showStateLabels
  stateLabelColorRef.current = stateLabelColor
  stateLabelSizeRef.current = stateLabelSize
  showInternalBordersRef.current = showInternalBorders
  showOuterBorderRef.current = showOuterBorder
  outerBorderColorRef.current = outerBorderColor
  outerBorderWidthRef.current = outerBorderWidth
  stateLabelPositionsRef.current = config.stateLabelPositions || {}
  areaRef.current = config.area || { type: 'brasil' }
  choroplethModeRef.current = choroplethMode
  choroplethPaletteRef.current = choroplethPalette
  showChoroplethLegendRef.current = showChoroplethLegend
  choroplethLegendTitleRef.current = choroplethLegendTitle
  choroplethLayerVisibleRef.current = choroplethLayerVisible
  geoJsonLayersRef.current = filteredGeoJsonLayers
  pointLayersRef.current = filteredPointLayers
  pointsLayerVisibleRef.current = pointsLayerVisible
  showLegendRef.current = showLegend
  legendXRef.current = legendX
  legendYRef.current = legendY
  legendScaleRef.current = legendScale
  legendBgRef.current = legendBg
  showPointsLegendRef.current = showPointsLegend
  pointsLegendLabelRef.current = pointsLegendLabel

  type ChoroplethColors = { colors: Record<string, string>; scale: ReturnType<typeof makeQuintilScale>; joined: Record<string, number> } | null
  const choroplethColorsRef = useRef<ChoroplethColors>(null)

  const choroplethColors = useMemo(() => {
    if (!choroplethMode || !choroplethData.length || !choroplethIdCol || !choroplethValueCol) {
      choroplethColorsRef.current = null
      return null
    }
    // Use the FULL choropleth nameMap for color computation so scale is consistent
    // across area changes. The filtered nameMap is for rendering only (which features to show).
    const activeNameMap = Object.keys(fullChoroplethNameMap).length > 0 ? fullChoroplethNameMap : (Object.keys(choroplethNameMapState).length > 0 ? choroplethNameMapState : nameMapState)
    const joined = joinChoropleth(choroplethData, choroplethIdCol, choroplethValueCol, activeNameMap)
    const palette = getPaletteColors(choroplethPalette, config.choroplethCustomStart, config.choroplethCustomEnd)
    const values = Object.values(joined)
    const scale = makeQuintilScale(values, palette, choroplethUnit, choroplethClasses)
    const colors: Record<string, string> = {}
    for (const [id, val] of Object.entries(joined)) {
      colors[id] = scale.colorFn(val)
    }
    const result = { colors, scale, joined }
    choroplethColorsRef.current = result
    return result
  }, [choroplethMode, choroplethData, choroplethIdCol, choroplethValueCol, choroplethPalette, choroplethUnit, choroplethClasses, nameMapState, choroplethNameMapState, fullChoroplethNameMap])

  const [ready, setReady] = useState(false)
  const [popup, setPopup] = useState<PopupState>({
    visible: false, x: 0, y: 0, featureId: '', featureName: '',
  })
  const [labelScreenPos, setLabelScreenPos] = useState<Record<string, { x: number; y: number }>>({})
  const [ufLabelScreenPos, setUfLabelScreenPos] = useState<Record<string, { x: number; y: number }>>({})
  const [draggingLabel, setDraggingLabel] = useState<{ fid: string; x: number; y: number } | null>(null)

  // Legend drag + resize live state
  const [legendLivePos, setLegendLivePos] = useState<{ x: number; y: number } | null>(null)
  const [legendLiveScale, setLegendLiveScale] = useState<number | null>(null)

  /* Helper: rebuild fill-color expression from current featureColors map */
  const applyColorExpr = useCallback(() => {
    const m = mapRef.current
    if (!m || !m.getLayer('area-fill')) return
    const colors = featureColorsRef.current
    const entries = Object.entries(colors)
    const fc = fillColorRef.current
    const expr: any = entries.length
      ? [
          'case',
          ...entries.flatMap(([id, color]) => [
            ['==', ['to-string', ['id']], id],
            color,
          ]),
          fc,
        ]
      : fc
    m.setPaintProperty('area-fill', 'fill-color', expr)
  }, [])

  const updateLabelPositions = useCallback(() => {
    if (labelRafRef.current !== null) return  // already scheduled
    labelRafRef.current = requestAnimationFrame(() => {
      labelRafRef.current = null
      const m = mapRef.current
      const cont = containerRef.current
      if (!m || !cont || !readyRef.current) return
      const cw = cont.offsetWidth || 1
      const ch = cont.offsetHeight || 1
      // Legacy geojson-derived centroids (kept for drag persistence keying)
      const pos: Record<string, { x: number; y: number }> = {}
      for (const [id, [lng, lat]] of Object.entries(geoCentersRef.current)) {
        try {
          const pt = m.project([lng, lat])
          pos[id] = { x: pt.x / cw, y: pt.y / ch }
        } catch { /* outside viewport */ }
      }
      setLabelScreenPos(pos)
      // UF label positions from static table — always computed regardless of area type
      const ufPos: Record<string, { x: number; y: number }> = {}
      for (const uf of UF_LABEL_DATA) {
        try {
          const pt = m.project([uf.lon, uf.lat])
          ufPos[String(uf.id)] = { x: pt.x / cw, y: pt.y / ch }
        } catch { /* outside viewport */ }
      }
      setUfLabelScreenPos(ufPos)
    })
  }, [])

  /* ── 1. Create map ONCE ── */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return

    const m = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8, sources: {}, layers: [],
        glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
      },
      center: config.center || [-54, -14],
      zoom: config.zoom ?? 3.2,
      attributionControl: false,
      preserveDrawingBuffer: true,
      transformRequest: (url) => {
        const isTile =
          url.includes('openstreetmap.org') ||
          url.includes('cartocdn.com') ||
          url.includes('arcgisonline.com') ||
          url.includes('tile.opentopomap.org')
        if (isTile) {
          return { url, crossOrigin: 'anonymous' }
        }
        return { url }
      },
    })

    m.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right')

    m.on('load', () => {
      readyRef.current = true
      setReady(true)
      m.resize()
    })

    mapRef.current = m

    /* Register for vector export. */
    const reg = (window as any).__studioMaps || ((window as any).__studioMaps = [])
    const entry = {
      id: block.id,
      map: m,
      container: containerRef.current,
      getSnapshot: () => {
        if (!readyRef.current) return null
        const cont = containerRef.current
        if (!cont) return null
        const b = m.getBounds()
        // All values read from refs — never from block.config or outer scope.
        // getSnapshot() is a stale closure created at map init; refs are live.
        const chData = choroplethColorsRef.current
        const hasChSection = choroplethModeRef.current && showChoroplethLegendRef.current && !!chData
        const hasPtSection = showPointsLegendRef.current && pointsLayerVisibleRef.current && markersRef.current.length > 0
        const hasPtLayerSection = pointLayersRef.current.some((l: any) => l.showLegend && l.visible)
        const hasGeoJsonSection = geoJsonLayersRef.current.some(l => l.showLegend && l.visible)
        const mapLegend = (showLegendRef.current && (hasChSection || hasPtSection || hasPtLayerSection || hasGeoJsonSection)) ? {
          x: legendXRef.current ?? 0.02,
          y: legendYRef.current ?? 0.65,
          scale: legendScaleRef.current ?? 1.0,
          bg: legendBgRef.current ?? 'transparent',
          choroplethTitle: hasChSection ? (choroplethLegendTitleRef.current || '') : undefined,
          choroplethLabels: hasChSection ? chData!.scale.labels : undefined,
          choroplethPalette: hasChSection ? chData!.scale.legendColors : undefined,
          showPoints: hasPtSection,
          pointsLabel: pointsLegendLabelRef.current || 'Pontos',
          pointsColor: markerColorRef.current,
          pointsIcon: markerIconRef.current || null,
          pointsIconColor: markerIconColorRef.current || markerColorRef.current,
          geoJsonLayers: hasGeoJsonSection ? geoJsonLayersRef.current.filter(l => l.showLegend && l.visible) : undefined,
          pointLayers: pointLayersRef.current.filter(l => l.showLegend && l.visible),
        } : null
        return {
          geojson: normGeojsonRef.current,
          nameMap: nameMapRef.current,
          west: b.getWest(),
          east: b.getEast(),
          south: b.getSouth(),
          north: b.getNorth(),
          width: cont.offsetWidth,
          height: cont.offsetHeight,
          featureColors: { ...featureColorsRef.current },
          fillColor: fillColorRef.current,
          borderColor: borderColorRef.current,
          borderWidth: borderWidthRef.current,
          markerColor: markerColorRef.current,
          markerSize: markerSizeRef.current,
          markerStrokeWidth: markerStrokeWidthRef.current,
          markerStrokeColor: markerStrokeColorRef.current,
          markerIcon: markerIconRef.current,
          markerIconColor: markerIconColorRef.current,
          markerStyle: markerStyleRef.current,
          points: [...markersRef.current].map((mk) => ({ lat: mk.lat, lon: mk.lon })),
          baseMap: baseMapRef.current,
          area: areaRef.current,
          showStateLabels: showStateLabelsRef.current,
          stateLabelColor: stateLabelColorRef.current,
          stateLabelSize: stateLabelSizeRef.current,
          stateLabelPositions: stateLabelPositionsRef.current,
          showInternalBorders: showInternalBordersRef.current,
          showOuterBorder: showOuterBorderRef.current,
          outerBorderColor: outerBorderColorRef.current,
          outerBorderWidth: outerBorderWidthRef.current,
          // Choropleth layer — all via refs, never stale
          choroplethGeojson: choroplethNormRef.current,
          choroplethColors: chData?.colors || {},
          choroplethMode: choroplethModeRef.current,
          choroplethLayerVisible: choroplethLayerVisibleRef.current,
          // GeoJSON layers
          geoJsonLayersData: geoJsonLayersRef.current,
          // Point layers
          pointLayersData: pointLayersRef.current,
          // Unified legend
          mapLegend,
          // Points layer
          pointsLayerVisible: pointsLayerVisibleRef.current,
        }
      },
      captureBasemap: async (): Promise<string | null> => {
        if (baseMapRef.current === 'none') return null
        const layersToHide = ['choropleth-fill', 'choropleth-border', 'area-fill', 'area-border', 'points-layer', 'state-labels', 'outer-border-layer']
        const restore: Array<() => void> = []
        for (const id of layersToHide) {
          if (m.getLayer(id)) {
            const prev = (m.getLayoutProperty(id, 'visibility') as string) || 'visible'
            m.setLayoutProperty(id, 'visibility', 'none')
            restore.push(() => m.setLayoutProperty(id, 'visibility', prev))
          }
        }
        await new Promise<void>((resolve) => m.once('idle', () => resolve()))
        let dataUrl: string
        try {
          dataUrl = m.getCanvas().toDataURL('image/png')
        } finally {
          restore.forEach((fn) => fn())
        }
        return dataUrl
      },
      captureFullCanvas: async (): Promise<string> => {
        await new Promise<void>((resolve) => m.once('idle', () => resolve()))
        const cont = containerRef.current
        if (!cont) return m.getCanvas().toDataURL('image/png')
        try {
          return await toPng(cont, { cacheBust: true, pixelRatio: 1, backgroundColor: 'transparent' })
        } catch {
          return m.getCanvas().toDataURL('image/png')
        }
      },
    }
    reg.push(entry)
    const cleanupReg = () => {
      const idx = reg.indexOf(entry)
      if (idx >= 0) reg.splice(idx, 1)
    }

    const ro = new ResizeObserver(() => m.resize())
    ro.observe(containerRef.current)

    return () => {
      cleanupReg()
      ro.disconnect()
      m.remove()
      mapRef.current = null
      readyRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── 2. Update GeoJSON source ── */
  useEffect(() => {
    const m = mapRef.current
    if (!m || !readyRef.current || !geojson) return

    const { geojson: norm, nameMap } = normalizeGeoJSON(geojson)
    normGeojsonRef.current = norm
    nameMapRef.current = nameMap
    setNameMapState(nameMap)
    /* Recompute geo centroids (used for drag persistence key consistency). */
    const centers: Record<string, [number, number]> = {}
    for (const f of norm.features) {
      const id = String(f.id ?? '')
      const c = geoFeatureCentroid(f)
      if (c) centers[id] = c
    }
    geoCentersRef.current = centers
    updateLabelPositions()

    const src = m.getSource('area') as maplibregl.GeoJSONSource | undefined
    if (src) {
      src.setData(norm)
    } else {
      m.addSource('area', { type: 'geojson', data: norm })
      m.addLayer({
        id: 'area-fill', type: 'fill', source: 'area',
        paint: {
          'fill-color': fillColor,
          'fill-opacity': fillOpacity,
        } as any,
      })
      m.addLayer({
        id: 'area-border', type: 'line', source: 'area',
        paint: { 'line-color': borderColor, 'line-width': borderWidth },
      })

      // Hover & click interactions
      m.on('mousemove', 'area-fill', (e) => {
        if (e.features && e.features.length > 0) {
          const fid = String(e.features[0].id ?? '')
          if (fid && fid !== hoveredRef.current) {
            if (hoveredRef.current !== null) {
              m.setFeatureState({ source: 'area', id: hoveredRef.current }, { hover: false })
            }
            hoveredRef.current = fid
            m.setFeatureState({ source: 'area', id: fid }, { hover: true })
          }
        }
        m.getCanvas().style.cursor = 'pointer'
      })

      m.on('mouseleave', 'area-fill', () => {
        if (hoveredRef.current !== null) {
          m.setFeatureState({ source: 'area', id: hoveredRef.current }, { hover: false })
          hoveredRef.current = null
        }
        m.getCanvas().style.cursor = ''
      })

      m.on('click', 'area-fill', (e) => {
        if (!e.features || e.features.length === 0) return
        const f = e.features[0]
        const fid = String(f.id ?? '')
        const point = e.point
        const value = choroplethColorsRef.current?.joined?.[fid]
        setPopup({
          visible: true,
          x: point.x,
          y: point.y,
          featureId: fid,
          featureName: nameMap[fid] || 'Área',
          featureValue: value,
        })
      })

      m.on('click', (e) => {
        const features = m.queryRenderedFeatures(e.point, { layers: ['area-fill'] })
        if (!features || features.length === 0) {
          setPopup((p) => ({ ...p, visible: false }))
        }
      })
    }

    /* Outer boundary source/layer */
    const outerEdges = extractOuterEdges(norm)
    const outerData: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', geometry: { type: 'MultiLineString', coordinates: outerEdges }, properties: {} }],
    }
    const outerSrc = m.getSource('outer-border') as maplibregl.GeoJSONSource | undefined
    if (outerSrc) {
      outerSrc.setData(outerData)
    } else {
      m.addSource('outer-border', { type: 'geojson', data: outerData })
      m.addLayer({
        id: 'outer-border-layer', type: 'line', source: 'outer-border',
        layout: { 'line-join': 'round', 'line-cap': 'round', visibility: showOuterBorderRef.current ? 'visible' : 'none' },
        paint: { 'line-color': outerBorderColorRef.current, 'line-width': outerBorderWidthRef.current },
      })
    }

    fitBounds()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geojson, ready])

  /* ── 2a. Compute full choropleth nameMap (unfiltered) for consistent color scale across area changes. ── */
  useEffect(() => {
    if (!choroplethGeojson) { setFullChoroplethNameMap({}); return }
    const { nameMap } = normalizeGeoJSON(choroplethGeojson)
    setFullChoroplethNameMap(nameMap)
  }, [choroplethGeojson])

  /* ── 2b. Choropleth GeoJSON source — re-runs when area changes (filteredChoroplethGeojson is area-filtered view). ── */
  useEffect(() => {
    const m = mapRef.current
    if (!m || !readyRef.current || !filteredChoroplethGeojson) return

    const { geojson: norm, nameMap } = normalizeGeoJSON(filteredChoroplethGeojson)
    choroplethNormRef.current = norm
    choroplethNameMapRef.current = nameMap
    setChoroplethNameMapState(nameMap)

    const src = m.getSource('choropleth') as maplibregl.GeoJSONSource | undefined
    if (src) {
      src.setData(norm)
    } else {
      m.addSource('choropleth', { type: 'geojson', data: norm })
      // Insert below area-fill so points always render on top
      const beforeLayer = m.getLayer('area-fill') ? 'area-fill' : (m.getLayer('outer-border-layer') ? 'outer-border-layer' : undefined)
      m.addLayer({
        id: 'choropleth-fill', type: 'fill', source: 'choropleth',
        paint: { 'fill-color': fillColorRef.current, 'fill-opacity': fillOpacityRef.current } as any,
      }, beforeLayer)
      m.addLayer({
        id: 'choropleth-border', type: 'line', source: 'choropleth',
        paint: { 'line-color': borderColorRef.current, 'line-width': 0.4 },
      }, beforeLayer)

      m.on('mousemove', 'choropleth-fill', (e) => {
        if (e.features && e.features.length > 0) {
          const fid = String(e.features[0].id ?? '')
          if (fid && fid !== hoveredRef.current) {
            if (hoveredRef.current !== null) {
              m.setFeatureState({ source: 'choropleth', id: hoveredRef.current }, { hover: false })
            }
            hoveredRef.current = fid
            m.setFeatureState({ source: 'choropleth', id: fid }, { hover: true })
          }
        }
        m.getCanvas().style.cursor = 'pointer'
      })
      m.on('mouseleave', 'choropleth-fill', () => {
        if (hoveredRef.current !== null) {
          m.setFeatureState({ source: 'choropleth', id: hoveredRef.current }, { hover: false })
          hoveredRef.current = null
        }
        m.getCanvas().style.cursor = ''
      })
      m.on('click', 'choropleth-fill', (e) => {
        if (!e.features || e.features.length === 0) return
        const f = e.features[0]
        const fid = String(f.id ?? '')
        const value = choroplethColorsRef.current?.joined?.[fid]
        setPopup({
          visible: true, x: e.point.x, y: e.point.y,
          featureId: fid,
          featureName: choroplethNameMapRef.current[fid] || nameMapRef.current[fid] || 'Área',
          featureValue: value,
        })
      })
    }

    // If no area GeoJSON, fit bounds to choropleth
    if (!geojson) {
      try {
        const bounds = new maplibregl.LngLatBounds()
        norm.features.forEach((f) => {
          const g = f.geometry
          if (g.type === 'Polygon') (g.coordinates[0] as number[][]).forEach((c) => bounds.extend(c as [number, number]))
          else if (g.type === 'MultiPolygon') (g.coordinates as number[][][][]).forEach((p) => p[0].forEach((c) => bounds.extend(c as [number, number])))
        })
        if (!bounds.isEmpty()) m.fitBounds(bounds, { padding: 16, maxZoom: 12, duration: 500 })
      } catch { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredChoroplethGeojson, ready])

  /* ── 3. Update paint properties ── */
  useEffect(() => {
    const m = mapRef.current
    if (!m || !readyRef.current) return

    // ── Choropleth fill layer ──
    const hasChoroplethLayer = !!m.getLayer('choropleth-fill')
    if (hasChoroplethLayer) {
      const vis = choroplethMode && choroplethLayerVisible ? 'visible' : 'none'
      m.setLayoutProperty('choropleth-fill', 'visibility', vis)
      m.setLayoutProperty('choropleth-border', 'visibility', vis)
      if (choroplethMode && choroplethColors) {
        const entries = Object.entries(choroplethColors.colors)
        const colorExpr: any = entries.length
          ? ['case', ...entries.flatMap(([id, color]) => [['==', ['to-string', ['id']], id], color]), fillColor]
          : fillColor
        m.setPaintProperty('choropleth-fill', 'fill-color', colorExpr)
        m.setPaintProperty('choropleth-fill', 'fill-opacity', ['case',
          ['boolean', ['feature-state', 'hover'], false], Math.min(1, fillOpacity + 0.12), fillOpacity,
        ] as any)
      }
    }

    // ── Area fill layer — hide when choropleth is active (choropleth-fill takes over) ──
    if (m.getLayer('area-fill')) {
      const areaVisible = choroplethMode ? 'none' : 'visible'
      m.setLayoutProperty('area-fill', 'visibility', areaVisible)
      if (!choroplethMode) {
        const fcEntries = Object.entries(featureColors)
        const colorExpr: any = fcEntries.length
          ? ['case', ...fcEntries.flatMap(([id, color]) => [['==', ['to-string', ['id']], id], color]), fillColor]
          : fillColor
        m.setPaintProperty('area-fill', 'fill-color', colorExpr)
        m.setPaintProperty('area-fill', 'fill-opacity', ['case',
          ['boolean', ['feature-state', 'hover'], false], Math.min(1, fillOpacity + 0.15), fillOpacity,
        ] as any)
      }
    }

    if (m.getLayer('area-border')) {
      m.setPaintProperty('area-border', 'line-color', borderColor)
      m.setPaintProperty('area-border', 'line-width', borderWidth)
      m.setLayoutProperty('area-border', 'visibility', showInternalBorders ? 'visible' : 'none')
    }

    if (m.getLayer('outer-border-layer')) {
      m.setLayoutProperty('outer-border-layer', 'visibility', showOuterBorder ? 'visible' : 'none')
      m.setPaintProperty('outer-border-layer', 'line-color', outerBorderColor)
      m.setPaintProperty('outer-border-layer', 'line-width', outerBorderWidth)
    }

    // ── Points layer visibility ──
    if (m.getLayer('points-layer')) {
      m.setLayoutProperty('points-layer', 'visibility', pointsLayerVisible ? 'visible' : 'none')
    }
  }, [fillColor, borderColor, borderWidth, fillOpacity, featureColors, showInternalBorders, showOuterBorder, outerBorderColor, outerBorderWidth, choroplethMode, choroplethColors, choroplethLayerVisible, pointsLayerVisible])

  /* ── 4. Update base map ── */
  useEffect(() => {
    const m = mapRef.current
    if (!m || !readyRef.current) return

    if (m.getLayer('basemap')) m.removeLayer('basemap')
    if (m.getSource('basemap')) m.removeSource('basemap')

    if (baseMap === 'none') return

    m.addSource('basemap', { type: 'raster', tiles: [BASEMAP_URLS[baseMap]], tileSize: 256 })
    const before = m.getLayer('choropleth-fill')
      ? 'choropleth-fill'
      : (m.getLayer('area-fill') ? 'area-fill' : undefined)
    m.addLayer({ id: 'basemap', type: 'raster', source: 'basemap' }, before)

    // Ensure basemap always stays below choropleth/area layers
    try {
      if (m.getLayer('choropleth-fill')) m.moveLayer('choropleth-fill')
      if (m.getLayer('choropleth-border')) m.moveLayer('choropleth-border')
      if (m.getLayer('area-fill')) m.moveLayer('area-fill')
      if (m.getLayer('area-border')) m.moveLayer('area-border')
      if (m.getLayer('outer-border-layer')) m.moveLayer('outer-border-layer')
    } catch {
      // ignore ordering errors
    }
  }, [baseMap])

  /* ── 5. Update markers/points ── */
  useEffect(() => {
    const m = mapRef.current
    if (!m || !readyRef.current) return

    // Clear previous markers (both circle layer and HTML markers)
    if (m.getLayer('points-layer')) m.removeLayer('points-layer')
    if (m.getSource('points')) m.removeSource('points')
    htmlMarkersRef.current.forEach((mk) => mk.remove())
    htmlMarkersRef.current = []

    if (markers.length === 0) return

    const iconRaw = markerIconRef.current
    const hasIcon = !!iconRaw
    const iconSize = Math.max(4, markerSizeRef.current ?? 3)
    const iconColor = markerIconColorRef.current || markerColorRef.current
    const strokeW = markerStrokeWidthRef.current ?? 0.8
    const strokeC = markerStrokeColorRef.current || '#ffffff'

    if (hasIcon) {
      const rawSvg = iconRaw!.startsWith('<svg')
        ? iconRaw!
        : (getIconByName(iconRaw!)?.svg || '')
      if (!rawSvg) {
        // fallback to circle if icon not found
        const pts: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: markers.map((p) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
            properties: {},
          })),
        }
        m.addSource('points', { type: 'geojson', data: pts })
        m.addLayer({
          id: 'points-layer', type: 'circle', source: 'points',
          paint: {
            'circle-color': markerColorRef.current,
            'circle-radius': markerSizeRef.current ?? 3,
            'circle-stroke-width': strokeW,
            'circle-stroke-color': strokeC,
            'circle-opacity': 0.92,
          },
        })
        return
      }

      const style = markerStyleRef.current || 'circle'
      const pinH = Math.round(iconSize * 1.5)  // pin height = 1.5× icon size

      markers.forEach((p) => {
        const el = document.createElement('div')
        el.style.pointerEvents = 'none'

        const svgContent = tintSvg(rawSvg, iconColor)

        if (style === 'naked') {
          // Icon only — no background, just drop shadow
          el.style.width = `${iconSize}px`
          el.style.height = `${iconSize}px`
          el.style.color = iconColor
          el.style.display = 'flex'
          el.style.alignItems = 'center'
          el.style.justifyContent = 'center'
          el.style.filter = 'drop-shadow(0 1px 3px rgba(0,0,0,0.55))'
          el.innerHTML = svgContent
        } else if (style === 'pin') {
          // Teardrop pin shape with icon in the top circle area
          el.style.width = `${iconSize}px`
          el.style.height = `${pinH}px`
          el.style.position = 'relative'
          el.style.display = 'flex'
          el.style.flexDirection = 'column'
          el.style.alignItems = 'center'
          el.style.filter = 'drop-shadow(0 2px 4px rgba(0,0,0,0.45))'
          const innerColor = strokeC || '#ffffff'
          el.innerHTML = `
            <svg width="${iconSize}" height="${pinH}" viewBox="0 0 24 34" xmlns="http://www.w3.org/2000/svg" style="position:absolute;top:0;left:0">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 22 12 22S24 21 24 12C24 5.37 18.63 0 12 0z" fill="${iconColor}"/>
              <circle cx="12" cy="12" r="7" fill="${innerColor}" fill-opacity="0.25"/>
            </svg>
            <div style="position:absolute;top:${(iconSize * 0.18).toFixed(0)}px;left:0;width:${iconSize}px;height:${iconSize}px;display:flex;align-items:center;justify-content:center;color:${innerColor}">
              ${svgContent.replace(/<svg[^>]*>|<\/svg>/g, '').replace(/width="[^"]*"/g, `width="${Math.round(iconSize * 0.5)}"`).replace(/height="[^"]*"/g, `height="${Math.round(iconSize * 0.5)}"`)}
            </div>`
        } else {
          // 'circle' (default) — icon on circle background
          el.style.width = `${iconSize}px`
          el.style.height = `${iconSize}px`
          el.style.color = iconColor
          el.style.display = 'flex'
          el.style.alignItems = 'center'
          el.style.justifyContent = 'center'
          el.style.filter = 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))'
          if (strokeW > 0) {
            el.style.border = `${strokeW}px solid ${strokeC}`
            el.style.borderRadius = '50%'
            el.style.padding = '1px'
            el.style.background = strokeC
          }
          el.innerHTML = svgContent
        }

        const anchor = style === 'pin' ? 'bottom' : 'center'
        const mk = new maplibregl.Marker({ element: el, anchor })
          .setLngLat([p.lon, p.lat])
          .addTo(m)
        htmlMarkersRef.current.push(mk)
      })
    } else {
      const pts: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: markers.map((p) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
          properties: {},
        })),
      }

      m.addSource('points', { type: 'geojson', data: pts })
      m.addLayer({
        id: 'points-layer', type: 'circle', source: 'points',
        paint: {
          'circle-color': markerColorRef.current,
          'circle-radius': markerSizeRef.current ?? 3,
          'circle-stroke-width': markerStrokeWidthRef.current ?? 0.8,
          'circle-stroke-color': markerStrokeColorRef.current,
          'circle-opacity': 0.92,
        },
      })
    }
  }, [markers, markerColor, markerSize, markerIcon, markerIconColor, markerStyle])

  /* ── 5b. GeoJSON overlay layers ── */
  useEffect(() => {
    const m = mapRef.current
    if (!m || !readyRef.current) return

    // Remove all existing GeoJSON overlay layers/sources
    const style = m.getStyle()
    const existingLayerIds = (style?.layers || []).map((l: any) => l.id).filter((id: string) => id.startsWith('gjl-'))
    const existingSourceIds = Object.keys(style?.sources || {}).filter(id => id.startsWith('gjl-'))
    for (const id of existingLayerIds) { try { m.removeLayer(id) } catch {} }
    for (const id of existingSourceIds) { try { m.removeSource(id) } catch {} }
    // Remove any HTML markers from GeoJSON layers
    geoJsonMarkersRef.current.forEach((mk) => mk.remove())
    geoJsonMarkersRef.current = []

    for (const layer of geoJsonLayersRef.current) {
      if (!layer.geojson) continue
      const srcId = `gjl-${layer.id}`
      const vis: 'visible' | 'none' = layer.visible ? 'visible' : 'none'
      try {
        m.addSource(srcId, { type: 'geojson', data: layer.geojson as any })
        const gt = layer.geometryType

        if (gt === 'Point' || gt === 'Mixed') {
          const hasIcon = !!layer.icon
          if (hasIcon) {
            // Use HTML markers for icon-based GeoJSON point layers
            const svgContent = layer.icon!.startsWith('<svg')
              ? layer.icon!
              : (getIconByName(layer.icon!)?.svg || '')
            if (svgContent) {
              const iconColor = layer.iconColor || layer.color
              const iconSize = Math.max(4, layer.pointSize ?? 8)
              const tintedSvg = tintSvg(svgContent, iconColor)
              const innerSvg = tintedSvg.replace(/<svg[^>]*>|<\/svg>/g, '')
              const features = (layer.geojson as any)?.features || []
              features.forEach((f: any) => {
                const geom = f.geometry
                if (!geom) return
                let coords: number[] | null = null
                if (geom.type === 'Point') coords = geom.coordinates
                else if (geom.type === 'MultiPoint') coords = geom.coordinates[0]
                if (!coords) return
                const el = document.createElement('div')
                el.style.width = `${iconSize}px`
                el.style.height = `${iconSize}px`
                el.style.display = 'flex'
                el.style.alignItems = 'center'
                el.style.justifyContent = 'center'
                el.style.filter = 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))'
                el.innerHTML = `<svg width="${iconSize}" height="${iconSize}" viewBox="0 0 24 24" fill="${iconColor}">${innerSvg}</svg>`
                try {
                  const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
                    .setLngLat(coords as [number, number])
                    .addTo(m)
                  geoJsonMarkersRef.current.push(marker)
                } catch { /* ignore */ }
              })
            }
          }
          // Always add circle layer as fallback / for features without icons
          m.addLayer({
            id: `${srcId}-pt`, type: 'circle', source: srcId,
            filter: ['match', ['geometry-type'], ['Point', 'MultiPoint'], true, false] as any,
            paint: {
              'circle-color': layer.color,
              'circle-radius': layer.pointSize ?? 6,
              'circle-opacity': hasIcon ? 0 : layer.opacity,
              'circle-stroke-width': hasIcon ? 0 : 1.5,
              'circle-stroke-color': 'rgba(255,255,255,0.75)',
            } as any,
            layout: { visibility: vis },
          })
        }
        if (gt === 'LineString' || gt === 'Mixed') {
          m.addLayer({
            id: `${srcId}-ln`, type: 'line', source: srcId,
            filter: ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false] as any,
            paint: {
              'line-color': layer.color,
              'line-width': layer.strokeWidth ?? 2,
              'line-opacity': layer.opacity,
            } as any,
            layout: { visibility: vis },
          })
        }
        if (gt === 'Polygon' || gt === 'Mixed') {
          m.addLayer({
            id: `${srcId}-fill`, type: 'fill', source: srcId,
            filter: ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false] as any,
            paint: { 'fill-color': layer.color, 'fill-opacity': (layer.opacity * 0.4) as any } as any,
            layout: { visibility: vis },
          })
          m.addLayer({
            id: `${srcId}-stroke`, type: 'line', source: srcId,
            filter: ['match', ['geometry-type'], ['Polygon', 'MultiPolygon'], true, false] as any,
            paint: {
              'line-color': layer.color,
              'line-width': layer.strokeWidth ?? 1.5,
              'line-opacity': layer.opacity,
            } as any,
            layout: { visibility: vis },
          })
        }
      } catch (e) { /* ignore */ }
    }
  }, [filteredGeoJsonLayers, ready])

  /* ── 5c. Point layer rendering ── */
  useEffect(() => {
    const m = mapRef.current
    if (!m || !readyRef.current) return

    // Remove all existing point layer sources/layers
    const style = m.getStyle()
    const existingLayerIds = (style?.layers || []).map((l: any) => l.id).filter((id: string) => id.startsWith('ptl-'))
    const existingSourceIds = Object.keys(style?.sources || {}).filter(id => id.startsWith('ptl-'))
    for (const id of existingLayerIds) { try { m.removeLayer(id) } catch {} }
    for (const id of existingSourceIds) { try { m.removeSource(id) } catch {} }
    // Remove any HTML markers from point layers
    pointHtmlMarkersRef.current.forEach((mk) => mk.remove())
    pointHtmlMarkersRef.current = []

    for (const layer of pointLayersRef.current) {
      if (!layer.points || layer.points.length === 0 || !layer.visible) continue
      const srcId = `ptl-${layer.id}`

      // Create GeoJSON from points
      const features: GeoJSON.Feature[] = layer.points.map((pt) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point', coordinates: [pt.lon, pt.lat] } as GeoJSON.Point,
        properties: {},
      }))
      const geojson: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features,
      }

      try {
        const hasIcon = !!layer.icon
        const iconColor = layer.iconColor || layer.color
        const circleRadius = Math.max(4, layer.size ?? 6)
        const strokeW = layer.strokeWidth ?? 1.5
        const strokeC = layer.strokeColor || 'rgba(255,255,255,0.75)'
        const layerStyle = layer.style || 'circle'

        if (hasIcon) {
          const rawSvg = layer.icon!.startsWith('<svg')
            ? layer.icon!
            : (getIconByName(layer.icon!)?.svg || '')

          if (!rawSvg) {
            // Fallback to circle
            m.addSource(srcId, { type: 'geojson', data: geojson })
            m.addLayer({
              id: `${srcId}-pt`, type: 'circle', source: srcId,
              paint: {
                'circle-color': layer.color,
                'circle-radius': circleRadius,
                'circle-opacity': layer.opacity || 0.92,
                'circle-stroke-width': strokeW,
                'circle-stroke-color': strokeC,
              } as any,
            })
          } else {
            const svgContent = tintSvg(rawSvg, iconColor)
            const pinH = Math.round(circleRadius * 1.5)

            layer.points.forEach((pt) => {
              const el = document.createElement('div')
              el.style.pointerEvents = 'none'

              if (layerStyle === 'naked') {
                el.style.width = `${circleRadius}px`
                el.style.height = `${circleRadius}px`
                el.style.color = iconColor
                el.style.display = 'flex'
                el.style.alignItems = 'center'
                el.style.justifyContent = 'center'
                el.style.filter = 'drop-shadow(0 1px 3px rgba(0,0,0,0.55))'
                el.innerHTML = svgContent
              } else if (layerStyle === 'pin') {
                el.style.width = `${circleRadius}px`
                el.style.height = `${pinH}px`
                el.style.position = 'relative'
                el.style.display = 'flex'
                el.style.flexDirection = 'column'
                el.style.alignItems = 'center'
                el.style.filter = 'drop-shadow(0 2px 4px rgba(0,0,0,0.45))'
                const innerColor = strokeC || '#ffffff'
                el.innerHTML = `
                  <svg width="${circleRadius}" height="${pinH}" viewBox="0 0 24 34" xmlns="http://www.w3.org/2000/svg" style="position:absolute;top:0;left:0">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 22 12 22S24 21 24 12C24 5.37 18.63 0 12 0z" fill="${iconColor}"/>
                    <circle cx="12" cy="12" r="7" fill="${innerColor}" fill-opacity="0.25"/>
                  </svg>
                  <div style="position:absolute;top:${(circleRadius * 0.18).toFixed(0)}px;left:0;width:${circleRadius}px;height:${circleRadius}px;display:flex;align-items:center;justify-content:center;color:${innerColor}">
                    ${svgContent.replace(/<svg[^>]*>|<\/svg>/g, '').replace(/width="[^"]*"/g, `width="${Math.round(circleRadius * 0.5)}"`).replace(/height="[^"]*"/g, `height="${Math.round(circleRadius * 0.5)}"`)}
                  </div>`
              } else {
                // circle style (default)
                el.style.width = `${circleRadius}px`
                el.style.height = `${circleRadius}px`
                el.style.color = iconColor
                el.style.display = 'flex'
                el.style.alignItems = 'center'
                el.style.justifyContent = 'center'
                el.style.filter = 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))'
                if (strokeW > 0) {
                  el.style.border = `${strokeW}px solid ${strokeC}`
                  el.style.borderRadius = '50%'
                  el.style.padding = '1px'
                  el.style.background = strokeC
                }
                el.innerHTML = svgContent
              }

              const anchor = layerStyle === 'pin' ? 'bottom' : 'center'
              const mk = new maplibregl.Marker({ element: el, anchor })
                .setLngLat([pt.lon, pt.lat])
                .addTo(m)
              pointHtmlMarkersRef.current.push(mk)
            })
          }
        } else {
          // Circle layer (no icon)
          m.addSource(srcId, { type: 'geojson', data: geojson })
          m.addLayer({
            id: `${srcId}-pt`, type: 'circle', source: srcId,
            paint: {
              'circle-color': layer.color,
              'circle-radius': circleRadius,
              'circle-opacity': layer.opacity || 0.92,
              'circle-stroke-width': strokeW,
              'circle-stroke-color': strokeC,
            } as any,
          })
        }
      } catch (e) { /* ignore */ }
    }
  }, [filteredPointLayers, ready])

  /* ── 6. Keep HTML label positions in sync with map pan/zoom ── */
  useEffect(() => {
    const m = mapRef.current
    if (!m || !ready) return
    m.on('move', updateLabelPositions)
    m.on('zoom', updateLabelPositions)
    return () => {
      m.off('move', updateLabelPositions)
      m.off('zoom', updateLabelPositions)
    }
  }, [ready, updateLabelPositions])

  /* ── 7. Label drag handler ── */
  const handleLabelDragStart = useCallback((fid: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const cont = containerRef.current
    if (!cont) return
    const cw = cont.offsetWidth || 1
    const ch = cont.offsetHeight || 1
    const basePos = stateLabelPositionsRef.current[fid] || labelScreenPos[fid]
    if (!basePos) return
    const startMX = e.clientX
    const startMY = e.clientY
    const startX = basePos.x * cw
    const startY = basePos.y * ch
    const onMove = (ev: MouseEvent) => {
      const nx = (startX + ev.clientX - startMX) / cw
      const ny = (startY + ev.clientY - startMY) / ch
      setDraggingLabel({ fid, x: nx, y: ny })
    }
    const onUp = (ev: MouseEvent) => {
      const nx = Math.max(0, Math.min(1, (startX + ev.clientX - startMX) / cw))
      const ny = Math.max(0, Math.min(1, (startY + ev.clientY - startMY) / ch))
      patchBlockConfig(block.id, {
        stateLabelPositions: { ...stateLabelPositionsRef.current, [fid]: { x: nx, y: ny } },
      })
      setDraggingLabel(null)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [block.id, labelScreenPos, patchBlockConfig])

  const handleLabelReset = useCallback((fid: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (!isSelected) return
    const next = { ...stateLabelPositionsRef.current }
    delete next[fid]
    patchBlockConfig(block.id, { stateLabelPositions: next })
  }, [block.id, isSelected, patchBlockConfig])

  /* ── Legend drag / resize handlers ── */
  const handleLegendDragStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const cont = containerRef.current
    if (!cont) return
    const cw = cont.offsetWidth || 1
    const ch = cont.offsetHeight || 1
    const startX = (legendXRef.current ?? 0.02) * cw
    const startY = (legendYRef.current ?? 0.65) * ch
    const startMX = e.clientX
    const startMY = e.clientY
    const onMove = (ev: MouseEvent) => {
      const nx = Math.max(0, Math.min(0.95, (startX + ev.clientX - startMX) / cw))
      const ny = Math.max(0, Math.min(0.95, (startY + ev.clientY - startMY) / ch))
      setLegendLivePos({ x: nx, y: ny })
    }
    const onUp = (ev: MouseEvent) => {
      const nx = Math.max(0, Math.min(0.95, (startX + ev.clientX - startMX) / cw))
      const ny = Math.max(0, Math.min(0.95, (startY + ev.clientY - startMY) / ch))
      patchBlockConfig(block.id, { legendX: nx, legendY: ny })
      setLegendLivePos(null)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [block.id, patchBlockConfig])

  const handleLegendResizeStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const startScale = legendScaleRef.current ?? 1.0
    const startMX = e.clientX
    const onMove = (ev: MouseEvent) => {
      const delta = (ev.clientX - startMX) / 80
      setLegendLiveScale(Math.max(0.5, Math.min(3.0, startScale + delta)))
    }
    const onUp = (ev: MouseEvent) => {
      const delta = (ev.clientX - startMX) / 80
      const ns = Math.max(0.5, Math.min(3.0, startScale + delta))
      patchBlockConfig(block.id, { legendScale: ns })
      setLegendLiveScale(null)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [block.id, patchBlockConfig])

  const fitBounds = useCallback(() => {
    const m = mapRef.current
    const gj = normGeojsonRef.current
    if (!m || !readyRef.current || !gj) return
    try {
      const bounds = new maplibregl.LngLatBounds()
      gj.features.forEach((f) => {
        const g = f.geometry
        if (g.type === 'Polygon') {
          ;(g.coordinates[0] as number[][]).forEach((c) => bounds.extend(c as [number, number]))
        } else if (g.type === 'MultiPolygon') {
          ;(g.coordinates as number[][][][]).forEach((poly) =>
            poly[0].forEach((c) => bounds.extend(c as [number, number]))
          )
        }
      })
      if (!bounds.isEmpty()) {
        m.fitBounds(bounds, { padding: 16, maxZoom: 12, duration: 500 })
      }
    } catch {
      // ignore
    }
  }, [])

  const applyColor = useCallback((color: string) => {
    if (!popup.featureId) return
    const next = { ...featureColorsRef.current, [popup.featureId]: color }
    featureColorsRef.current = next
    patchBlockConfig(block.id, { featureColors: next })
    setPopup((p) => ({ ...p, visible: false }))
    setTimeout(() => applyColorExpr(), 0)
  }, [popup.featureId, applyColorExpr, patchBlockConfig, block.id])

  const removeColor = useCallback(() => {
    if (!popup.featureId) return
    const next = { ...featureColorsRef.current }
    delete next[popup.featureId]
    featureColorsRef.current = next
    patchBlockConfig(block.id, { featureColors: next })
    setPopup((p) => ({ ...p, visible: false }))
    setTimeout(() => applyColorExpr(), 0)
  }, [popup.featureId, applyColorExpr, patchBlockConfig, block.id])

  const loading = !ready || (!geojson && !choroplethGeojson && geoJsonLayers.length === 0)

  return (
    <div className="w-full h-full relative overflow-hidden rounded-lg">
      <div ref={containerRef} className="w-full h-full" />

      {loading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2" style={{ background: '#0d1b2a' }}>
          <div className="h-5 w-5 rounded-full border-2 border-[var(--accent)] border-t-transparent animate-spin" />
          <span className="text-[10px] font-medium tracking-wide" style={{ color: 'var(--text-subtle)' }}>
            {ready ? t(language, 'mapblock.selectAreaOrData') : t(language, 'choropleth.loadingMap')}
          </span>
        </div>
      )}

      {/* Active map indicator + name badge */}
      {(isSelected || isActive) && (
        <div
          className="hide-on-export absolute top-2 left-2 z-10 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-semibold"
          style={{
            background: isActive ? 'var(--accent)' : 'rgba(0,0,0,0.6)',
            color: isActive ? '#fff' : 'var(--text)',
            backdropFilter: 'blur(4px)',
          }}
        >
          {isActive && <Star size={10} fill="currentColor" />}
          {config.name || t(language, 'left.map')}
        </div>
      )}

      {/* Action buttons */}
      <div
        className="hide-on-export absolute top-2 right-2 z-10 flex gap-1"
        style={{
          opacity: isSelected ? 1 : 0,
          pointerEvents: isSelected ? 'auto' : 'none',
        }}
      >
        {!isActive && (
          <button
            onClick={(e) => { e.stopPropagation(); setActiveMapId(block.id) }}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold transition-opacity"
            style={{
              background: 'rgba(0,0,0,0.65)',
              color: 'var(--text)',
              backdropFilter: 'blur(4px)',
            }}
            title={t(language, 'mapblock.activateForEditing')}
          >
            {t(language, 'common.edit')}
          </button>
        )}
        <button
          onClick={(e) => { e.stopPropagation(); fitBounds() }}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold transition-opacity"
          style={{
            background: 'rgba(0,0,0,0.65)',
            color: 'var(--text)',
            backdropFilter: 'blur(4px)',
          }}
          title={t(language, 'mapblock.fitToArea')}
        >
          <Crosshair size={11} />
          {t(language, 'mapblock.fit')}
        </button>
      </div>

      {/* State labels HTML overlay — static UF table, works for any area type */}
      {showStateLabels && ready && (() => {
        const area = config.area || { type: 'brasil' }
        const visibleUfs = UF_LABEL_DATA.filter((uf) => {
          if (area.type === 'brasil' || !area.id) return true
          if (area.type === 'region') return UF_REGION[uf.id] === (area.id as number)
          if (area.type === 'uf') return uf.id === (area.id as number)
          if (area.type === 'municipio') return uf.id === Math.floor(((area.id as number) || 0) / 100000)
          return true
        })
        if (visibleUfs.length === 0) return null
        return (
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
            {visibleUfs.map((uf) => {
              const fid = String(uf.id)
              const dragging = draggingLabel?.fid === fid ? draggingLabel : null
              const customPos = config.stateLabelPositions?.[fid]
              const screenPos = dragging || customPos || ufLabelScreenPos[fid]
              if (!screenPos) return null
              const cw = containerRef.current?.offsetWidth || 300
              const ch = containerRef.current?.offsetHeight || 200
              const px = screenPos.x * cw
              const py = screenPos.y * ch
              const isCustomized = !!customPos && !dragging
              return (
                <div
                  key={fid}
                  title={isSelected ? (isCustomized ? t(language, 'mapblock.doubleClickResetPos') : t(language, 'mapblock.dragToMove')) : undefined}
                  style={{
                    position: 'absolute',
                    left: px,
                    top: py,
                    transform: 'translate(-50%, -50%)',
                    fontSize: stateLabelSize,
                    fontWeight: 600,
                    color: stateLabelColor,
                    textShadow: '0 0 3px rgba(0,0,0,0.8), 0 0 6px rgba(0,0,0,0.5)',
                    cursor: isSelected ? (draggingLabel?.fid === fid ? 'grabbing' : 'grab') : 'default',
                    pointerEvents: isSelected ? 'auto' : 'none',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                    fontFamily: 'system-ui, sans-serif',
                    lineHeight: 1,
                    padding: isSelected ? '2px 4px' : 0,
                    borderRadius: 3,
                    outline: isSelected
                      ? isCustomized
                        ? '1.5px solid rgba(31,111,160,0.7)'
                        : '1px dashed rgba(255,255,255,0.25)'
                      : 'none',
                    background: isSelected && isCustomized ? 'rgba(31,111,160,0.18)' : 'transparent',
                  }}
                  onMouseDown={isSelected ? (e) => handleLabelDragStart(fid, e) : undefined}
                  onDoubleClick={isSelected ? (e) => handleLabelReset(fid, e) : undefined}
                >
                  {uf.sigla}
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* Color picker popup */}
      {popup.visible && (
        <div
          className="map-color-popup absolute z-30 rounded-lg border p-2 space-y-2 shadow-xl"
          style={{
            left: Math.min(popup.x + 12, (containerRef.current?.offsetWidth || 300) - 180),
            top: Math.min(popup.y - 12, (containerRef.current?.offsetHeight || 200) - 120),
            background: 'var(--surface)',
            borderColor: 'var(--border)',
            width: 172,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              {popup.featureName}
            </span>
            <button
              onClick={() => setPopup((p) => ({ ...p, visible: false }))}
              className="text-[10px] font-bold px-1 rounded hover:bg-[var(--surface-strong)]"
              style={{ color: 'var(--text-subtle)' }}
            >
              ✕
            </button>
          </div>
          {popup.featureValue !== undefined && (
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
              {popup.featureValue.toLocaleString('pt-BR')}{choroplethUnit ? ` ${choroplethUnit}` : ''}
            </div>
          )}
          {!choroplethMode && (
            <>
              <div className="grid grid-cols-5 gap-1">
                {PALETTE.map((color) => (
                  <button
                    key={color}
                    onClick={() => applyColor(color)}
                    className="w-6 h-6 rounded-sm border transition-transform hover:scale-110"
                    style={{
                      backgroundColor: color,
                      borderColor: featureColors[popup.featureId] === color ? 'var(--accent)' : 'var(--border)',
                      boxShadow: featureColors[popup.featureId] === color ? '0 0 0 2px var(--accent)' : 'none',
                    }}
                    title={color}
                  />
                ))}
              </div>

              {featureColors[popup.featureId] && (
                <button
                  onClick={removeColor}
                  className="w-full text-[10px] font-semibold py-1 rounded border"
                  style={{
                    color: 'var(--danger)',
                    background: 'rgba(239,68,68,0.08)',
                    borderColor: 'rgba(239,68,68,0.25)',
                  }}
                >
                  {t(language, 'mapblock.removeColor')}
                </button>
              )}

              <div className="flex items-center gap-1.5 pt-1 border-t" style={{ borderColor: 'var(--border)' }}>
                <input
                  type="color"
                  value={featureColors[popup.featureId] || fillColor}
                  onChange={(e) => applyColor(e.target.value)}
                  className="w-6 h-6 rounded-sm border p-0 cursor-pointer"
                  style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)' }}
                />
                <span className="text-[9px]" style={{ color: 'var(--text-subtle)' }}>{t(language, 'mapblock.customColor')}</span>
              </div>
            </>
          )}
        </div>
      )}
      {/* Unified map legend — draggable, resizable */}
      {showLegend && ready && (() => {
        const hasChSection = choroplethMode && showChoroplethLegend && !!choroplethColors
        const hasPtSection = showPointsLegend && pointsLayerVisible && markers.length > 0
        const hasPtLayerSection = pointLayers.some(l => l.showLegend && l.visible)
        const hasGeoJsonSection = geoJsonLayers.some(l => l.showLegend && l.visible)
        if (!hasChSection && !hasPtSection && !hasPtLayerSection && !hasGeoJsonSection) return null

        const livePos = legendLivePos
        const liveScale = legendLiveScale
        const curX = (livePos?.x ?? legendX)
        const curY = (livePos?.y ?? legendY)
        const curScale = liveScale ?? legendScale
        const s = curScale

        // legendColors are already the computed colors per label — no need to re-index the raw palette
        const isTransparent = !legendBg || legendBg === 'transparent'

        const markerIconSvg = markerIcon
          ? (markerIcon.startsWith('<svg') ? markerIcon : getIconByName(markerIcon)?.svg || null)
          : null

        return (
          <div
            style={{
              position: 'absolute',
              left: `${curX * 100}%`,
              top: `${curY * 100}%`,
              background: isTransparent ? 'transparent' : legendBg,
              border: isTransparent ? 'none' : '1px solid rgba(255,255,255,0.12)',
              borderRadius: 6 * s,
              padding: `${7 * s}px ${10 * s}px`,
              zIndex: 20,
              cursor: isSelected ? (legendLivePos ? 'grabbing' : 'grab') : 'default',
              backdropFilter: isTransparent ? 'none' : 'blur(6px)',
              minWidth: 120 * s,
              userSelect: 'none',
            }}
            onMouseDown={isSelected ? handleLegendDragStart : undefined}
          >
            {/* Choropleth section */}
            {hasChSection && (
              <div>
                {choroplethLegendTitle && (
                  <div style={{ fontSize: 10 * s, fontWeight: 700, color: '#c8d4e0', marginBottom: 5 * s, letterSpacing: 0.3 }}>
                    {choroplethLegendTitle}
                  </div>
                )}
                {choroplethColors!.scale.labels.map((label, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 * s, marginBottom: 3 * s }}>
                    <div style={{ width: 12 * s, height: 12 * s, borderRadius: 2 * s, background: choroplethColors!.scale.legendColors[i], flexShrink: 0 }} />
                    <span style={{ fontSize: 9 * s, color: '#8899aa', whiteSpace: 'nowrap' }}>{label}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Points section */}
            {hasPtSection && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 * s, marginTop: hasChSection ? 6 * s : 0 }}>
                {markerIconSvg ? (
                  <div style={{ width: 12 * s, height: 12 * s, color: markerIconColor, flexShrink: 0 }}
                    dangerouslySetInnerHTML={{ __html: markerIconSvg }} />
                ) : (
                  <div style={{ width: 10 * s, height: 10 * s, borderRadius: '50%', background: markerColor, flexShrink: 0 }} />
                )}
                <span style={{ fontSize: 9 * s, color: '#8899aa', whiteSpace: 'nowrap' }}>{pointsLegendLabel}</span>
              </div>
            )}

            {/* Point layers section */}
            {pointLayers.filter(l => l.showLegend && l.visible).map((layer, i) => {
              const layerIconSvg = layer.icon
                ? (layer.icon.startsWith('<svg') ? layer.icon : getIconByName(layer.icon)?.svg || null)
                : null
              const firstPtAbove = (i === 0 && !hasChSection && !hasPtSection)
              return (
                <div key={layer.id} style={{ display: 'flex', alignItems: 'center', gap: 5 * s, marginTop: firstPtAbove ? 0 : 3 * s }}>
                  {layerIconSvg ? (
                    <div style={{ width: 12 * s, height: 12 * s, color: layer.iconColor || layer.color, flexShrink: 0 }}
                      dangerouslySetInnerHTML={{ __html: tintSvg(layerIconSvg, layer.iconColor || layer.color) }} />
                  ) : (
                    <div style={{ width: 10 * s, height: 10 * s, borderRadius: '50%', background: layer.color, flexShrink: 0 }} />
                  )}
                  <span style={{ fontSize: 9 * s, color: '#8899aa', whiteSpace: 'nowrap' }}>{layer.name}</span>
                </div>
              )
            })}

            {/* GeoJSON layers section */}
            {hasGeoJsonSection && geoJsonLayers.filter(l => l.showLegend && l.visible).map((layer, i) => (
              <div key={layer.id} style={{ display: 'flex', alignItems: 'center', gap: 5 * s, marginTop: (i === 0 && (hasChSection || hasPtSection)) ? 6 * s : (i === 0 ? 0 : 3 * s) }}>
                {layer.geometryType === 'LineString' ? (
                  <svg width={14 * s} height={8 * s} style={{ flexShrink: 0, overflow: 'visible' }}>
                    <line x1={0} y1={4 * s} x2={14 * s} y2={4 * s} stroke={layer.color} strokeWidth={2 * s} />
                  </svg>
                ) : layer.geometryType === 'Polygon' ? (
                  <div style={{ width: 10 * s, height: 10 * s, background: layer.color, opacity: 0.75, borderRadius: 1 * s, flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 10 * s, height: 10 * s, borderRadius: '50%', background: layer.color, flexShrink: 0 }} />
                )}
                <span style={{ fontSize: 9 * s, color: '#8899aa', whiteSpace: 'nowrap' }}>{layer.name}</span>
              </div>
            ))}

            {/* Resize handle — only in edit mode */}
            {isSelected && (
              <div
                title={t(language, 'mapblock.dragToResize')}
                style={{
                  position: 'absolute', bottom: 2, right: 2,
                  width: 14, height: 14, cursor: 'se-resize',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'rgba(255,255,255,0.4)', fontSize: 10,
                }}
                onMouseDown={(e) => { e.stopPropagation(); handleLegendResizeStart(e) }}
              >
                ⌟
              </div>
            )}
          </div>
        )
      })()}
    </div>
  )
})

export default StudioMapBlockInner
