/**
 * SVG-first export for the Studio infographic board.
 *
 * Architecture:
 *
 * 1. The SVG is the single source of truth for ALL export formats.
 *    PNG/JPG/PDF rasterize the same SVG via a canvas — there is no
 *    separate raster pipeline that could drift out of sync with vector.
 *
 * 2. Map blocks publish a getSnapshot() function on the window registry.
 *    The snapshot is a plain-data freeze of what MapLibre is currently
 *    showing: normalized GeoJSON, the lng/lat bbox in view, the rendered
 *    viewport size, per-feature colors and style. The exporter consumes
 *    that — it never queries the DOM or reads `getBoundingClientRect`.
 *
 * 3. The Mercator projection used here is hand-rolled to map the bbox
 *    corners *exactly* onto the block viewport corners. d3-geo's
 *    `fitExtent` preserves aspect ratio (letterboxes), but MapLibre does
 *    not — its bbox always fills the viewport. Matching MapLibre means
 *    the SVG output is WYSIWYG with the on-screen map.
 *
 * 4. Basemap raster (when active) is captured by hiding the choropleth
 *    layers, dataURL'ing the WebGL canvas, then re-showing them. It is
 *    embedded in the SVG as a single <image>; the choropleth <path>
 *    elements sit on top and remain editable.
 *
 * 5. Fallback path: if a map block has no snapshot or no GeoJSON, the
 *    full WebGL canvas is captured as <image>. The export still looks
 *    correct, it is just no longer vector for that block.
 */
import { toPng } from 'html-to-image'
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import { getIconByName, tintSvg } from '../../lib/mapIcons'
import type {
  Block,
  InfographicSpec,
  TextBlockConfig,
  CardBlockConfig,
  DividerBlockConfig,
  ImageBlockConfig,
  ConnectorBlockConfig,
  GeoJsonLayer,
  PointLayer,
} from '../types'
import type { ExportSelection } from '../store/studioStore'
import { buildPathD, getAnchorPoint, buildMarkerSVG } from '../Canvas/blocks/ConnectorBlock'
import { maskPathFor } from '../Canvas/blocks/ImageBlock'

/* ── Static UF geographic data (mirrors StudioMapBlock constant) ─────── */
const UF_LABEL_DATA = [
  { id: 12, sigla: 'AC', lon: -70.5, lat: -9.2  }, { id: 27, sigla: 'AL', lon: -36.6, lat: -9.6  },
  { id: 16, sigla: 'AP', lon: -51.3, lat:  1.4  }, { id: 13, sigla: 'AM', lon: -65.0, lat: -4.0  },
  { id: 29, sigla: 'BA', lon: -41.7, lat: -12.9 }, { id: 23, sigla: 'CE', lon: -39.6, lat: -5.2  },
  { id: 53, sigla: 'DF', lon: -47.9, lat: -15.8 }, { id: 32, sigla: 'ES', lon: -40.7, lat: -19.6 },
  { id: 52, sigla: 'GO', lon: -49.7, lat: -15.9 }, { id: 21, sigla: 'MA', lon: -45.3, lat: -4.9  },
  { id: 51, sigla: 'MT', lon: -55.9, lat: -12.9 }, { id: 50, sigla: 'MS', lon: -54.7, lat: -20.5 },
  { id: 31, sigla: 'MG', lon: -44.7, lat: -18.4 }, { id: 15, sigla: 'PA', lon: -52.0, lat: -3.7  },
  { id: 25, sigla: 'PB', lon: -36.8, lat: -7.1  }, { id: 41, sigla: 'PR', lon: -51.6, lat: -24.7 },
  { id: 26, sigla: 'PE', lon: -37.9, lat: -8.4  }, { id: 22, sigla: 'PI', lon: -42.8, lat: -7.6  },
  { id: 33, sigla: 'RJ', lon: -43.0, lat: -22.3 }, { id: 24, sigla: 'RN', lon: -36.9, lat: -5.8  },
  { id: 43, sigla: 'RS', lon: -53.2, lat: -30.0 }, { id: 11, sigla: 'RO', lon: -62.8, lat: -11.0 },
  { id: 14, sigla: 'RR', lon: -61.0, lat:  2.0  }, { id: 42, sigla: 'SC', lon: -50.5, lat: -27.3 },
  { id: 28, sigla: 'SE', lon: -37.4, lat: -10.6 }, { id: 35, sigla: 'SP', lon: -48.5, lat: -22.2 },
  { id: 17, sigla: 'TO', lon: -48.2, lat: -10.2 },
]
const UF_REGION: Record<number, number> = {
  11:1, 12:1, 13:1, 14:1, 15:1, 16:1, 17:1,
  21:2, 22:2, 23:2, 24:2, 25:2, 26:2, 27:2, 28:2, 29:2,
  31:3, 32:3, 33:3, 35:3,
  41:4, 42:4, 43:4,
  50:5, 51:5, 52:5, 53:5,
}

/* ── Registry types ─────────────────────────────────────────────────── */

interface MapLegend {
  x: number            // fraction of block width
  y: number            // fraction of block height
  scale: number        // size multiplier
  bg: string           // CSS color or 'transparent'
  choroplethTitle?: string
  choroplethLabels?: string[]
  choroplethPalette?: string[]
  showPoints?: boolean
  pointsLabel?: string
  pointsColor?: string
  pointsIcon?: string | null
  pointsIconColor?: string | null
  geoJsonLayers?: GeoJsonLayer[]
  pointLayers?: PointLayer[]
}

interface MapSnapshot {
  geojson: FeatureCollection | null
  nameMap: Record<string, string>
  west: number
  east: number
  south: number
  north: number
  width: number
  height: number
  featureColors: Record<string, string>
  fillColor: string
  borderColor: string
  borderWidth: number
  markerColor: string
  markerSize: number
  markerStrokeWidth: number
  markerStrokeColor: string
  markerIcon?: string | null
  markerIconColor?: string | null
  markerStyle?: string
  points: { lat: number; lon: number }[]
  baseMap: string
  area?: { type: string; id?: number | null }
  showStateLabels: boolean
  stateLabelColor: string
  stateLabelSize: number
  stateLabelPositions: Record<string, { x: number; y: number }>
  showInternalBorders: boolean
  showOuterBorder: boolean
  outerBorderColor: string
  outerBorderWidth: number
  // Choropleth layer (separate GeoJSON from area)
  choroplethGeojson?: FeatureCollection | null
  choroplethColors?: Record<string, string>
  choroplethMode?: boolean
  choroplethLayerVisible?: boolean
  // Unified legend
  mapLegend?: MapLegend | null
  // Points layer
  pointsLayerVisible?: boolean
  // GeoJSON layers data (for rendering on map)
  geoJsonLayersData?: GeoJsonLayer[]
  // Point layers data (for rendering on map)
  pointLayersData?: PointLayer[]
}

interface MapEntry {
  id: string
  map: any
  container: HTMLElement
  getSnapshot?: () => MapSnapshot | null
  captureBasemap?: () => Promise<string | null>
  captureFullCanvas?: () => Promise<string>
}

interface ExportCtx {
  theme: Record<string, string>
  defs: string[]
}

/* ── Utilities ──────────────────────────────────────────────────────── */

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/\r?\n|\r/g, ' ')
    .replace(/\t/g, ' ')
}

function resolveColor(value: string | undefined, theme: Record<string, string>, fallback: string): string {
  if (!value) return fallback
  const v = value.trim()
  if (v.startsWith('var(')) {
    const m = v.match(/var\(\s*(--[^,)]+)\s*(?:,\s*([^)]+))?\)/)
    if (m) {
      const name = m[1].trim()
      const fb = m[2]?.trim()
      return theme[name] || (fb ? resolveColor(fb, theme, fallback) : fallback)
    }
    return fallback
  }
  if (v.startsWith('--')) return theme[v] || fallback
  return v
}

function readThemeColors(): Record<string, string> {
  const cs = getComputedStyle(document.documentElement)
  const names = [
    '--text', '--text-muted', '--text-subtle',
    '--bg', '--surface', '--surface-strong', '--surface-muted',
    '--border', '--accent', '--success', '--danger',
    '--gridline', '--font-condensed',
  ]
  const out: Record<string, string> = {}
  for (const n of names) {
    const v = cs.getPropertyValue(n).trim()
    if (v) out[n] = v
  }
  return out
}

function intersects(b: Block, sel: ExportSelection): boolean {
  const { x, y, w, h } = b.bounds
  return !(x + w < sel.x || x > sel.x + sel.w || y + h < sel.y || y > sel.y + sel.h)
}

/* ── Web Mercator projection that matches MapLibre exactly ──────────── */
/* MapLibre's visible viewport always contains exactly map.getBounds(),
 * so we map (west,north) → (0,0) and (east,south) → (w,h) with mercator
 * y. No aspect preservation; that's the whole point — d3.fitExtent would
 * preserve aspect and put the map in a sub-region. */
function makeMercatorProjector(snap: MapSnapshot) {
  const { west, east, south, north, width, height } = snap
  const dLng = east - west
  const mercY = (lat: number) => {
    const phi = (lat * Math.PI) / 180
    // Clamp to avoid Infinity at poles
    const c = Math.max(-Math.PI / 2 + 1e-9, Math.min(Math.PI / 2 - 1e-9, phi))
    return Math.log(Math.tan(Math.PI / 4 + c / 2))
  }
  const yN = mercY(north)
  const yS = mercY(south)
  const dY = yN - yS // positive: north is bigger mercY than south
  return ([lng, lat]: [number, number]): [number, number] => {
    const x = ((lng - west) / dLng) * width
    const y = ((yN - mercY(lat)) / dY) * height
    return [x, y]
  }
}

/* ── Path generation ────────────────────────────────────────────────── */

type Ring = number[][] // [[lng,lat], ...]

function ringToPath(ring: Ring, project: (p: [number, number]) => [number, number]): string {
  if (ring.length === 0) return ''
  const parts: string[] = []
  for (let i = 0; i < ring.length; i++) {
    const [x, y] = project(ring[i] as [number, number])
    parts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`)
  }
  parts.push('Z')
  return parts.join(' ')
}

function featureToPathD(
  feature: Feature<Polygon | MultiPolygon>,
  project: (p: [number, number]) => [number, number]
): string {
  const g = feature.geometry
  if (!g) return ''
  if (g.type === 'Polygon') {
    return (g.coordinates as Ring[]).map((r) => ringToPath(r, project)).join(' ')
  }
  if (g.type === 'MultiPolygon') {
    return (g.coordinates as Ring[][])
      .map((poly) => poly.map((r) => ringToPath(r, project)).join(' '))
      .join(' ')
  }
  return ''
}

/* ── Outer boundary extraction (shared edges cancel out) ────────────── */
function extractOuterEdgesForExport(fc: FeatureCollection): [number[], number[]][] {
  const edgeCount = new Map<string, number>()
  const edgeData = new Map<string, [number[], number[]]>()
  const toKey = (p: number[]) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`
  const addEdge = (a: number[], b: number[]) => {
    const ka = toKey(a); const kb = toKey(b)
    const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`
    edgeCount.set(key, (edgeCount.get(key) || 0) + 1)
    if (!edgeData.has(key)) edgeData.set(key, [a, b])
  }
  const processRing = (ring: number[][]) => { for (let i = 0; i < ring.length - 1; i++) addEdge(ring[i], ring[i + 1]) }
  for (const f of fc.features) {
    const g = (f as Feature).geometry
    if (!g) continue
    if (g.type === 'Polygon') { for (const r of (g as Polygon).coordinates) processRing(r as number[][]) }
    else if (g.type === 'MultiPolygon') { for (const p of (g as MultiPolygon).coordinates) for (const r of p) processRing(r as number[][]) }
  }
  const result: [number[], number[]][] = []
  for (const [key, count] of edgeCount) { if (count === 1) result.push(edgeData.get(key)!) }
  return result
}

/* ── Map block rendering ────────────────────────────────────────────── */

async function renderMapBlock(block: Block, ctx: ExportCtx): Promise<string> {
  const w = block.bounds.w
  const h = block.bounds.h
  const maps = ((window as any).__studioMaps as MapEntry[] | undefined) || []
  const entry = maps.find((m) => m.id === block.id)

  // Hard fallback: no entry at all → solid placeholder.
  if (!entry) {
    return `<rect width="${w}" height="${h}" fill="#0d1b2a"/>`
  }

  const snap = entry.getSnapshot?.() || null

  // Soft fallback: no snapshot or no renderable GeoJSON → full canvas capture
  if (!snap || (!snap.geojson && !snap.choroplethGeojson)) {
    if (entry.captureFullCanvas) {
      try {
        const url = await entry.captureFullCanvas()
        return `<image href="${esc(url)}" width="${w}" height="${h}" preserveAspectRatio="none"/>`
      } catch {
        /* fall through */
      }
    }
    return `<rect width="${w}" height="${h}" fill="#0d1b2a"/>`
  }

  const project = makeMercatorProjector(snap)
  const sx = w / snap.width
  const sy = h / snap.height

  const layers: string[] = []

  /* Basemap raster */
  if (snap.baseMap !== 'none' && entry.captureBasemap) {
    try {
      const dataUrl = await entry.captureBasemap()
      if (dataUrl) {
        layers.push(`<image href="${esc(dataUrl)}" width="${w}" height="${h}" preserveAspectRatio="none"/>`)
      }
    } catch { /* ignore */ }
  }

  // Scale transform for when canvas size differs from block bounds (rare)
  const needsScale = Math.abs(sx - 1) > 1e-3 || Math.abs(sy - 1) > 1e-3
  const openScale = needsScale ? `<g transform="scale(${sx} ${sy})">` : ''
  const closeScale = needsScale ? `</g>` : ''
  const internalBorderW = snap.showInternalBorders !== false ? snap.borderWidth : 0

  /* ── Choropleth layer (separate GeoJSON with computed quintil colors) ── */
  const isChoropleth = snap.choroplethMode && snap.choroplethLayerVisible !== false && snap.choroplethGeojson
  if (isChoropleth) {
    const choroplethByColor = new Map<string, string[]>()
    for (const f of snap.choroplethGeojson!.features) {
      const fid = String((f as Feature).id ?? (f.properties as any)?.id ?? '')
      const fill = (snap.choroplethColors || {})[fid] || snap.fillColor
      const d = featureToPathD(f as Feature<Polygon | MultiPolygon>, project)
      if (!d) continue
      const arr = choroplethByColor.get(fill) || []
      arr.push(`<path d="${d}"/>`)
      choroplethByColor.set(fill, arr)
    }
    const choroParts: string[] = [openScale]
    for (const [color, paths] of choroplethByColor) {
      choroParts.push(
        `<g fill="${esc(color)}" fill-opacity="0.85" stroke="${esc(snap.borderColor)}" stroke-width="${internalBorderW * 0.4}" stroke-linejoin="round" vector-effect="non-scaling-stroke">${paths.join('')}</g>`
      )
    }
    choroParts.push(closeScale)
    layers.push(choroParts.join(''))
  }

  /* ── Area fill layer — only when choropleth is not active ── */
  if (!snap.choroplethMode && snap.geojson) {
    const byColor = new Map<string, string[]>()
    for (const f of snap.geojson.features) {
      const fid = String((f as Feature).id ?? (f.properties as any)?.id ?? '')
      const fill = snap.featureColors[fid] || snap.fillColor
      const d = featureToPathD(f as Feature<Polygon | MultiPolygon>, project)
      if (!d) continue
      const name = snap.nameMap[fid] || fid
      const node = `<path d="${d}" data-feature-id="${esc(fid)}"><title>${esc(String(name))}</title></path>`
      const arr = byColor.get(fill) || []
      arr.push(node)
      byColor.set(fill, arr)
    }
    const areaParts: string[] = [openScale]
    for (const [color, paths] of byColor) {
      areaParts.push(
        `<g fill="${esc(color)}" fill-opacity="0.85" stroke="${esc(snap.borderColor)}" stroke-width="${internalBorderW}" stroke-linejoin="round" vector-effect="non-scaling-stroke">${paths.join('')}</g>`
      )
    }
    areaParts.push(closeScale)
    layers.push(areaParts.join(''))
  }

  /* Area borders on top of choropleth — shows state/region outlines when choropleth is active */
  if (isChoropleth && snap.geojson && snap.showInternalBorders !== false) {
    const areaBorderParts: string[] = [openScale]
    for (const f of snap.geojson.features) {
      const d = featureToPathD(f as Feature<Polygon | MultiPolygon>, project)
      if (d) areaBorderParts.push(`<path d="${d}" fill="none"/>`)
    }
    areaBorderParts.push(closeScale)
    layers.push(`<g stroke="${esc(snap.borderColor)}" stroke-width="${snap.borderWidth}" stroke-linejoin="round" vector-effect="non-scaling-stroke" fill="none">${areaBorderParts.join('')}</g>`)
  }

  /* Outer boundary — use choropleth geojson when active, else area */
  const outerSourceGeo = (isChoropleth ? snap.choroplethGeojson : snap.geojson) ?? null
  if (snap.showOuterBorder && outerSourceGeo) {
    const outerColor = snap.outerBorderColor || '#ffffff'
    const outerWidth = snap.outerBorderWidth ?? 2
    const outerEdges = extractOuterEdgesForExport(outerSourceGeo)
    const outerParts: string[] = [openScale]
    for (const [a, b] of outerEdges) {
      const [ax, ay] = project(a as [number, number])
      const [bx, by] = project(b as [number, number])
      outerParts.push(`<line x1="${ax.toFixed(2)}" y1="${ay.toFixed(2)}" x2="${bx.toFixed(2)}" y2="${by.toFixed(2)}" stroke="${esc(outerColor)}" stroke-width="${outerWidth}" stroke-linecap="round" vector-effect="non-scaling-stroke"/>`)
    }
    outerParts.push(closeScale)
    layers.push(`<g>${outerParts.join('')}</g>`)
  }

  /* Points overlay — respect layer visibility */
  if (snap.points.length && snap.pointsLayerVisible !== false) {
    const pointParts: string[] = [openScale]

    const rawIconSvg = snap.markerIcon
      ? (snap.markerIcon.startsWith('<svg') ? snap.markerIcon : getIconByName(snap.markerIcon)?.svg)
      : null

    if (rawIconSvg) {
      const iconColor = snap.markerIconColor || snap.markerColor
      const iconSvg = tintSvg(rawIconSvg, iconColor)
      const iconSize = Math.max(4, snap.markerSize)
      const halfSize = iconSize / 2
      const strokeW = snap.markerStrokeWidth ?? 0.8
      const strokeC = snap.markerStrokeColor || '#ffffff'
      const mStyle = snap.markerStyle || 'circle'
      const innerSvg = iconSvg.replace(/<svg[^>]*>|<\/svg>/g, '')

      for (const p of snap.points) {
        const [x, y] = project([p.lon, p.lat])
        if (mStyle === 'pin') {
          const pinH = iconSize * 1.5
          const smallSz = iconSize * 0.5
          pointParts.push(
            `<g transform="translate(${x.toFixed(2)},${(y - pinH).toFixed(2)})">` +
            `<path d="M${halfSize.toFixed(1)} 0 C0 0 0 ${(iconSize * 0.8).toFixed(1)} ${halfSize.toFixed(1)} ${pinH.toFixed(1)} C${(iconSize).toFixed(1)} ${(iconSize * 0.8).toFixed(1)} ${iconSize.toFixed(1)} 0 ${halfSize.toFixed(1)} 0Z" fill="${esc(iconColor)}"/>` +
            `<circle cx="${halfSize.toFixed(1)}" cy="${(iconSize * 0.42).toFixed(1)}" r="${(iconSize * 0.28).toFixed(1)}" fill="white" fill-opacity="0.25"/>` +
            `<svg x="${((iconSize - smallSz) / 2).toFixed(1)}" y="${((iconSize * 0.42) - smallSz / 2).toFixed(1)}" width="${smallSz.toFixed(1)}" height="${smallSz.toFixed(1)}" viewBox="0 0 24 24" fill="white">${innerSvg}</svg>` +
            `</g>`
          )
        } else if (mStyle === 'naked') {
          pointParts.push(
            `<g transform="translate(${x.toFixed(2)},${y.toFixed(2)}) translate(-${halfSize.toFixed(1)},-${halfSize.toFixed(1)})" filter="drop-shadow(0 1px 2px rgba(0,0,0,0.55))"><svg width="${iconSize.toFixed(1)}" height="${iconSize.toFixed(1)}" viewBox="0 0 24 24" fill="${esc(iconColor)}">${innerSvg}</svg></g>`
          )
        } else {
          // 'circle' — icon on circle background
          if (strokeW > 0) {
            pointParts.push(
              `<g transform="translate(${x.toFixed(2)},${y.toFixed(2)})">` +
              `<circle cx="0" cy="0" r="${(halfSize + strokeW).toFixed(1)}" fill="${esc(strokeC)}"/>` +
              `<g transform="translate(-${halfSize.toFixed(1)},-${halfSize.toFixed(1)})"><svg width="${iconSize.toFixed(1)}" height="${iconSize.toFixed(1)}" viewBox="0 0 24 24" fill="${esc(iconColor)}">${innerSvg}</svg></g>` +
              `</g>`
            )
          } else {
            pointParts.push(
              `<g transform="translate(${x.toFixed(2)},${y.toFixed(2)}) translate(-${halfSize.toFixed(1)},-${halfSize.toFixed(1)})"><svg width="${iconSize.toFixed(1)}" height="${iconSize.toFixed(1)}" viewBox="0 0 24 24" fill="${esc(iconColor)}">${innerSvg}</svg></g>`
            )
          }
        }
      }
    } else {
      pointParts.push(
        `<g fill="${esc(snap.markerColor)}" fill-opacity="0.9" stroke="${esc(snap.markerStrokeColor)}" stroke-width="${snap.markerStrokeWidth}" vector-effect="non-scaling-stroke">`
      )
      for (const p of snap.points) {
        const [x, y] = project([p.lon, p.lat])
        pointParts.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${snap.markerSize}"/>`)
      }
      pointParts.push(`</g>`)
    }
    pointParts.push(closeScale)
    layers.push(pointParts.join(''))
  }

  /* ── GeoJSON layers overlay ── */
  if (snap.geoJsonLayersData && snap.geoJsonLayersData.length > 0) {
    for (const layer of snap.geoJsonLayersData) {
      if (!layer.visible || !layer.geojson) continue
      const layerParts: string[] = [openScale]
      const geomType = layer.geometryType
      const features = (layer.geojson as any).features as Feature[]
      for (const f of features) {
        const g = (f as Feature).geometry
        if (!g) continue
        if (geomType === 'Point' || g.type === 'Point' || g.type === 'MultiPoint') {
          const layerIconSvg = layer.icon
            ? (layer.icon.startsWith('<svg') ? layer.icon : getIconByName(layer.icon)?.svg)
            : null
          const iconColor = layer.iconColor || layer.color
          const iconSize = Math.max(4, layer.pointSize ?? 8)
          const halfSize = iconSize / 2
          if (layerIconSvg) {
            const tinted = tintSvg(layerIconSvg, iconColor)
            const innerSvg = tinted.replace(/<svg[^>]*>|<\/svg>/g, '')
            if (g.type === 'Point') {
              const [lon, lat] = (g as any).coordinates as [number, number]
              const [x, y] = project([lon, lat])
              layerParts.push(
                `<g transform="translate(${x.toFixed(2)},${y.toFixed(2)}) translate(-${halfSize.toFixed(1)},-${halfSize.toFixed(1)})" filter="drop-shadow(0 1px 2px rgba(0,0,0,0.35))">` +
                `<svg width="${iconSize.toFixed(1)}" height="${iconSize.toFixed(1)}" viewBox="0 0 24 24" fill="${esc(iconColor)}">${innerSvg}</svg>` +
                `</g>`
              )
            } else if (g.type === 'MultiPoint') {
              for (const pt of (g as any).coordinates as number[][]) {
                const [x, y] = project(pt as [number, number])
                layerParts.push(
                  `<g transform="translate(${x.toFixed(2)},${y.toFixed(2)}) translate(-${halfSize.toFixed(1)},-${halfSize.toFixed(1)})" filter="drop-shadow(0 1px 2px rgba(0,0,0,0.35))">` +
                  `<svg width="${iconSize.toFixed(1)}" height="${iconSize.toFixed(1)}" viewBox="0 0 24 24" fill="${esc(iconColor)}">${innerSvg}</svg>` +
                  `</g>`
                )
              }
            }
          } else {
            if (g.type === 'Point') {
              const [lon, lat] = (g as any).coordinates as [number, number]
              const [x, y] = project([lon, lat])
              const r = (layer.pointSize ?? 8) / 2
              layerParts.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r}" fill="${esc(layer.color)}" opacity="${layer.opacity}"/>`)
            } else if (g.type === 'MultiPoint') {
              for (const pt of (g as any).coordinates as number[][]) {
                const [x, y] = project(pt as [number, number])
                const r = (layer.pointSize ?? 8) / 2
                layerParts.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r}" fill="${esc(layer.color)}" opacity="${layer.opacity}"/>`)
              }
            }
          }
        } else if (geomType === 'LineString' || g.type === 'LineString' || g.type === 'MultiLineString') {
          if (g.type === 'LineString') {
            const d = (g as any).coordinates.map((c: number[], i: number) => {
              const [x, y] = project(c as [number, number])
              return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`
            }).join(' ')
            layerParts.push(`<path d="${d}" fill="none" stroke="${esc(layer.color)}" stroke-width="${layer.strokeWidth ?? 1.5}" opacity="${layer.opacity}" stroke-linecap="round" stroke-linejoin="round"/>`)
          } else if (g.type === 'MultiLineString') {
            for (const line of (g as any).coordinates as number[][][]) {
              const d = line.map((c: number[], i: number) => {
                const [x, y] = project(c as [number, number])
                return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`
              }).join(' ')
              layerParts.push(`<path d="${d}" fill="none" stroke="${esc(layer.color)}" stroke-width="${layer.strokeWidth ?? 1.5}" opacity="${layer.opacity}" stroke-linecap="round" stroke-linejoin="round"/>`)
            }
          }
        } else if (geomType === 'Polygon' || g.type === 'Polygon' || g.type === 'MultiPolygon') {
          const d = featureToPathD(f as Feature<Polygon | MultiPolygon>, project)
          if (d) {
            layerParts.push(`<path d="${d}" fill="${esc(layer.color)}" fill-opacity="${(layer.opacity ?? 0.85) * 0.5}" stroke="${esc(layer.color)}" stroke-width="${layer.strokeWidth ?? 1.5}" opacity="${layer.opacity}" stroke-linejoin="round"/>`)
          }
        }
      }
      layerParts.push(closeScale)
      layers.push(layerParts.join(''))
    }
  }

  /* ── Point layers overlay ── */
  if (snap.pointLayersData && snap.pointLayersData.length > 0) {
    for (const layer of snap.pointLayersData) {
      if (!layer.visible || !layer.points || layer.points.length === 0) continue
      const layerParts: string[] = [openScale]
      const ptColor = layer.color || '#d9822b'
      const ptSize = layer.size ?? 6
      const r = ptSize / 2
      const layerIconSvg = layer.icon
        ? (layer.icon.startsWith('<svg') ? layer.icon : getIconByName(layer.icon)?.svg)
        : null
      const iconColor = layer.iconColor || ptColor

      if (layerIconSvg) {
        const tinted = tintSvg(layerIconSvg, iconColor)
        const innerSvg = tinted.replace(/<svg[^>]*>|<\/svg>/g, '')
        const halfSize = ptSize / 2
        for (const p of layer.points) {
          const [x, y] = project([p.lon, p.lat])
          layerParts.push(
            `<g transform="translate(${x.toFixed(2)},${y.toFixed(2)}) translate(-${halfSize.toFixed(1)},-${halfSize.toFixed(1)})" filter="drop-shadow(0 1px 2px rgba(0,0,0,0.35))">` +
            `<svg width="${ptSize.toFixed(1)}" height="${ptSize.toFixed(1)}" viewBox="0 0 24 24" fill="${esc(iconColor)}">${innerSvg}</svg>` +
            `</g>`
          )
        }
      } else {
        for (const p of layer.points) {
          const [x, y] = project([p.lon, p.lat])
          layerParts.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r}" fill="${esc(ptColor)}" opacity="${layer.opacity ?? 0.92}"/>`)
        }
      }
      layerParts.push(closeScale)
      layers.push(layerParts.join(''))
    }
  }

  /* State labels — static UF table, filtered to visible area, works for all area types */
  if (snap.showStateLabels) {
    const area = snap.area || { type: 'brasil' }
    const areaId = area.id as number | null | undefined
    const visibleUfs = UF_LABEL_DATA.filter((uf) => {
      if (area.type === 'brasil' || !areaId) return true
      if (area.type === 'region') return UF_REGION[uf.id] === areaId
      if (area.type === 'uf') return uf.id === areaId
      if (area.type === 'municipio') return uf.id === Math.floor((areaId || 0) / 100000)
      return true
    })
    const labelParts: string[] = []
    const fs = snap.stateLabelSize
    for (const uf of visibleUfs) {
      const fid = String(uf.id)
      let px: number
      let py: number
      const custom = snap.stateLabelPositions[fid]
      if (custom) {
        px = custom.x * w
        py = custom.y * h
      } else {
        // Project static lon/lat centroid through the same Mercator projector
        const [lx, ly] = project([uf.lon, uf.lat])
        px = lx * sx
        py = ly * sy
      }
      labelParts.push(
        `<text x="${px.toFixed(2)}" y="${py.toFixed(2)}" text-anchor="middle" dominant-baseline="middle"` +
        ` font-family="system-ui, sans-serif" font-size="${fs}" font-weight="600"` +
        ` fill="${esc(snap.stateLabelColor)}" stroke="rgba(0,0,0,0.65)" stroke-width="1.5" paint-order="stroke">${esc(uf.sigla)}</text>`
      )
    }
    if (labelParts.length > 0) layers.push(`<g>${labelParts.join('')}</g>`)
  }

  /* Unified map legend */
  if (snap.mapLegend) {
    const leg = snap.mapLegend
    const s = leg.scale || 1.0
    const pad = 8 * s
    const rowH = 16 * s
    const swatchSz = 12 * s
    const fontSize = 9 * s
    const titleSz = 10 * s

    // Compute content height
    const titleH = leg.choroplethTitle ? 18 * s : 0
    const chRows = (leg.choroplethLabels?.length || 0) * rowH
    const ptRow = leg.showPoints ? rowH : 0
    const sepH = (leg.choroplethLabels?.length && leg.showPoints) ? 6 * s : 0
    const contentH = titleH + chRows + sepH + ptRow
    const legH = pad * 2 + contentH
    const legW = 152 * s

    const lx = leg.x * w
    const ly = leg.y * h

    const isTransparent = !leg.bg || leg.bg === 'transparent'

    const legParts: string[] = []
    if (!isTransparent) {
      legParts.push(`<rect x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" width="${legW.toFixed(1)}" height="${legH.toFixed(1)}" rx="${(6 * s).toFixed(1)}" fill="${esc(leg.bg)}" stroke="rgba(255,255,255,0.12)" stroke-width="1"/>`)
    }

    let ty = ly + pad
    const tx = lx + pad

    if (leg.choroplethTitle) {
      legParts.push(`<text x="${tx.toFixed(1)}" y="${(ty + titleSz).toFixed(1)}" font-family="system-ui,sans-serif" font-size="${titleSz.toFixed(1)}" font-weight="700" fill="#c8d4e0">${esc(leg.choroplethTitle)}</text>`)
      ty += titleH
    }

    if (leg.choroplethLabels && leg.choroplethPalette) {
      for (let i = 0; i < leg.choroplethLabels.length; i++) {
        const ry = ty + i * rowH
        const sy2 = ry + (rowH - swatchSz) / 2
        legParts.push(
          `<rect x="${tx.toFixed(1)}" y="${sy2.toFixed(1)}" width="${swatchSz.toFixed(1)}" height="${swatchSz.toFixed(1)}" rx="${(2 * s).toFixed(1)}" fill="${esc(leg.choroplethPalette[i] || '#999')}"/>` +
          `<text x="${(tx + swatchSz + 4 * s).toFixed(1)}" y="${(sy2 + swatchSz * 0.78).toFixed(1)}" font-family="system-ui,sans-serif" font-size="${fontSize.toFixed(1)}" fill="#8899aa">${esc(leg.choroplethLabels[i])}</text>`
        )
      }
      ty += chRows + sepH
    }

    if (leg.showPoints) {
      const ry = ty + (rowH - swatchSz) / 2
      const ptColor = leg.pointsColor || '#d9822b'
      const ptIconColor = leg.pointsIconColor || ptColor
      const iconSvg = leg.pointsIcon
        ? (leg.pointsIcon.startsWith('<svg') ? leg.pointsIcon : getIconByName(leg.pointsIcon)?.svg)
        : null

      if (iconSvg) {
        const stripped = iconSvg.replace(/<svg[^>]*>|<\/svg>/g, '')
        legParts.push(
          `<svg x="${tx.toFixed(1)}" y="${ry.toFixed(1)}" width="${swatchSz.toFixed(1)}" height="${swatchSz.toFixed(1)}" viewBox="0 0 24 24" fill="${esc(ptIconColor)}">${stripped}</svg>` +
          `<text x="${(tx + swatchSz + 4 * s).toFixed(1)}" y="${(ry + swatchSz * 0.78).toFixed(1)}" font-family="system-ui,sans-serif" font-size="${fontSize.toFixed(1)}" fill="#8899aa">${esc(leg.pointsLabel || 'Pontos')}</text>`
        )
      } else {
        const r = (swatchSz / 2).toFixed(1)
        const cx = (tx + swatchSz / 2).toFixed(1)
        const cy = (ry + swatchSz / 2).toFixed(1)
        legParts.push(
          `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${esc(ptColor)}"/>` +
          `<text x="${(tx + swatchSz + 4 * s).toFixed(1)}" y="${(ry + swatchSz * 0.78).toFixed(1)}" font-family="system-ui,sans-serif" font-size="${fontSize.toFixed(1)}" fill="#8899aa">${esc(leg.pointsLabel || 'Pontos')}</text>`
        )
      }
      ty += rowH + sepH
    }

    if (leg.geoJsonLayers && leg.geoJsonLayers.length > 0) {
      for (const layer of leg.geoJsonLayers) {
        const ry = ty + (rowH - swatchSz) / 2
        const geomType = layer.geometryType
        let swatch = ''
        if (geomType === 'Point' || geomType === 'Mixed') {
          const gjlIconSvg = layer.icon
            ? (layer.icon.startsWith('<svg') ? layer.icon : getIconByName(layer.icon)?.svg)
            : null
          if (gjlIconSvg) {
            const gjlIconColor = layer.iconColor || layer.color
            const tinted = tintSvg(gjlIconSvg, gjlIconColor)
            const stripped = tinted.replace(/<svg[^>]*>|<\/svg>/g, '')
            swatch = `<svg x="${tx.toFixed(1)}" y="${ry.toFixed(1)}" width="${swatchSz.toFixed(1)}" height="${swatchSz.toFixed(1)}" viewBox="0 0 24 24" fill="${esc(gjlIconColor)}">${stripped}</svg>`
          } else {
            const r = (swatchSz / 2).toFixed(1)
            const cx = (tx + swatchSz / 2).toFixed(1)
            const cy = (ry + swatchSz / 2).toFixed(1)
            swatch = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${esc(layer.color)}" opacity="${layer.opacity}"/>`
          }
        } else if (geomType === 'LineString') {
          swatch = `<line x1="${tx.toFixed(1)}" y1="${(ry + swatchSz / 2).toFixed(1)}" x2="${(tx + swatchSz).toFixed(1)}" y2="${(ry + swatchSz / 2).toFixed(1)}" stroke="${esc(layer.color)}" stroke-width="${(layer.strokeWidth || 1.5) * s}" opacity="${layer.opacity}"/>`
        } else if (geomType === 'Polygon') {
          swatch = `<rect x="${tx.toFixed(1)}" y="${ry.toFixed(1)}" width="${swatchSz.toFixed(1)}" height="${swatchSz.toFixed(1)}" fill="${esc(layer.color)}" opacity="${layer.opacity * 0.4}" stroke="${esc(layer.color)}" stroke-width="${(layer.strokeWidth || 1.5) * s}"/>`
        }
        legParts.push(
          swatch +
          `<text x="${(tx + swatchSz + 4 * s).toFixed(1)}" y="${(ry + swatchSz * 0.78).toFixed(1)}" font-family="system-ui,sans-serif" font-size="${fontSize.toFixed(1)}" fill="#8899aa">${esc(layer.name)}</text>`
        )
        ty += rowH
      }
    }

    if (leg.pointLayers && leg.pointLayers.length > 0) {
      for (const layer of leg.pointLayers) {
        const ry = ty + (rowH - swatchSz) / 2
        const ptSize = (layer.size ?? 6) * s
        const ptColor = layer.color || '#d9822b'
        const ptIconColor = layer.iconColor || ptColor
        const iconSvg = layer.icon
          ? (layer.icon.startsWith('<svg') ? layer.icon : getIconByName(layer.icon)?.svg)
          : null

        let swatch = ''
        if (iconSvg) {
          const tinted = tintSvg(iconSvg, ptIconColor)
          const stripped = tinted.replace(/<svg[^>]*>|<\/svg>/g, '')
          swatch = `<svg x="${tx.toFixed(1)}" y="${ry.toFixed(1)}" width="${ptSize.toFixed(1)}" height="${ptSize.toFixed(1)}" viewBox="0 0 24 24" fill="${esc(ptIconColor)}">${stripped}</svg>`
        } else {
          const r = (ptSize / 2).toFixed(1)
          const cx = (tx + ptSize / 2).toFixed(1)
          const cy = (ry + ptSize / 2).toFixed(1)
          const opacity = layer.opacity || 0.92
          swatch = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${esc(ptColor)}" opacity="${opacity}"/>`
        }
        legParts.push(
          swatch +
          `<text x="${(tx + ptSize + 4 * s).toFixed(1)}" y="${(ry + ptSize * 0.78).toFixed(1)}" font-family="system-ui,sans-serif" font-size="${fontSize.toFixed(1)}" fill="#8899aa">${esc(layer.name)}</text>`
        )
        ty += rowH
      }
    }

    layers.push(`<g>${legParts.join('')}</g>`)
  }

  /* Clip everything to the block bounds */
  const clipId = `clip-map-${block.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
  ctx.defs.push(
    `<clipPath id="${esc(clipId)}"><rect x="0" y="0" width="${w}" height="${h}"/></clipPath>`
  )
  return `<g clip-path="url(#${esc(clipId)})">${layers.join('')}</g>`
}

/* ── Text block ─────────────────────────────────────────────────────── */
/* Rich HTML → SVG converter.
 *
 * Walks the HTML AST and produces a sequence of "runs" — chunks of text
 * carrying inherited inline style (weight, style, decoration, color).
 * Then it wraps runs into lines using a per-run measurement, and emits
 * <text>+<tspan> markup so each formatting fragment renders identically
 * to the WYSIWYG editor.
 */

interface RunStyle {
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  color?: string
}

interface Run { text: string; style: RunStyle }

function styleEquals(a: RunStyle, b: RunStyle): boolean {
  return a.bold === b.bold && a.italic === b.italic && a.underline === b.underline && a.strike === b.strike && a.color === b.color
}

function parseStyleAttr(s: string): { color?: string; weight?: number; italic?: boolean } {
  const out: { color?: string; weight?: number; italic?: boolean } = {}
  const m = s.match(/color\s*:\s*([^;]+)/i); if (m) out.color = m[1].trim()
  const w = s.match(/font-weight\s*:\s*([^;]+)/i); if (w) out.weight = parseInt(w[1])
  const it = /font-style\s*:\s*italic/i.test(s); if (it) out.italic = true
  return out
}

function htmlToRuns(html: string): Run[] {
  const div = document.createElement('div')
  div.innerHTML = html.replace(/<br\s*\/?>(?!\n)/gi, '\n')
  const runs: Run[] = []
  const baseStyle: RunStyle = { bold: false, italic: false, underline: false, strike: false }
  const walk = (node: Node, style: RunStyle) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const txt = node.textContent || ''
      if (txt.length) runs.push({ text: txt, style: { ...style } })
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as HTMLElement
    const next: RunStyle = { ...style }
    const tag = el.tagName.toUpperCase()
    if (tag === 'B' || tag === 'STRONG') next.bold = true
    if (tag === 'I' || tag === 'EM') next.italic = true
    if (tag === 'U') next.underline = true
    if (tag === 'S' || tag === 'STRIKE' || tag === 'DEL') next.strike = true
    if (tag === 'BR') { runs.push({ text: '\n', style: { ...style } }); return }
    const sa = el.getAttribute('style') || ''
    if (sa) {
      const parsed = parseStyleAttr(sa)
      if (parsed.color) next.color = parsed.color
      if (parsed.weight && parsed.weight >= 600) next.bold = true
      if (parsed.italic) next.italic = true
    }
    el.childNodes.forEach((c) => walk(c, next))
  }
  div.childNodes.forEach((c) => walk(c, baseStyle))
  return runs
}

function applyTransform(text: string, transform: string | undefined): string {
  if (transform === 'uppercase') return text.toUpperCase()
  if (transform === 'lowercase') return text.toLowerCase()
  if (transform === 'capitalize') {
    return text.replace(/\b\w/g, (m) => m.toUpperCase())
  }
  return text
}

function fontFamilyFor(key: TextBlockConfig['fontFamily'], theme: Record<string, string>): string {
  switch (key) {
    case 'condensed':
      return theme['--font-condensed'] || 'Inter, system-ui, sans-serif'
    case 'serif':
      return 'Georgia, "Times New Roman", serif'
    case 'mono':
      return '"SF Mono", "JetBrains Mono", Consolas, monospace'
    default:
      return 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
  }
}

const measureCanvasCtx = (() => {
  let ctx: CanvasRenderingContext2D | null = null
  return () => {
    if (ctx) return ctx
    if (typeof document === 'undefined') return null
    ctx = document.createElement('canvas').getContext('2d')
    return ctx
  }
})()

function measureRunWidth(text: string, fontSize: number, weight: number, italic: boolean, fontFamily: string, letterSpacing: number): number {
  const ctx = measureCanvasCtx()
  if (!ctx) return text.length * fontSize * 0.55
  ctx.font = `${italic ? 'italic ' : ''}${weight} ${fontSize}px ${fontFamily}`
  return ctx.measureText(text).width + (text.length - 1) * letterSpacing
}

interface PositionedRun { run: Run; width: number }
interface Line { runs: PositionedRun[]; width: number }

function wrapRuns(
  runs: Run[],
  fontSize: number,
  baseWeight: number,
  fontFamily: string,
  maxWidth: number,
  letterSpacing: number,
  textTransform: string | undefined
): Line[] {
  const lines: Line[] = []
  let curLine: Line = { runs: [], width: 0 }

  const pushLine = () => {
    lines.push(curLine)
    curLine = { runs: [], width: 0 }
  }

  for (const r of runs) {
    const transformed = applyTransform(r.text, textTransform)
    // Split on \n hard breaks first
    const segments = transformed.split('\n')
    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si]
      if (seg.length) {
        // Word-wrap within this segment
        const words = seg.split(/(\s+)/).filter((s) => s.length > 0)
        for (const w of words) {
          const weight = r.style.bold ? 700 : baseWeight
          const ww = measureRunWidth(w, fontSize, weight, r.style.italic, fontFamily, letterSpacing)
          // If this single token doesn't fit on a fresh line, just place it anyway.
          if (curLine.width + ww > maxWidth && curLine.runs.length > 0) {
            // Don't start a line with a leading space
            if (/^\s+$/.test(w)) { pushLine(); continue }
            pushLine()
          }
          // Merge with previous run if style identical (compact tspan output)
          const last = curLine.runs[curLine.runs.length - 1]
          if (last && styleEquals(last.run.style, r.style)) {
            last.run.text += w
            last.width += ww
            curLine.width += ww
          } else {
            curLine.runs.push({ run: { text: w, style: r.style }, width: ww })
            curLine.width += ww
          }
        }
      }
      if (si < segments.length - 1) pushLine()
    }
  }
  if (curLine.runs.length > 0 || lines.length === 0) pushLine()
  // Trim trailing whitespace per line to align right correctly
  for (const ln of lines) {
    if (ln.runs.length > 0) {
      const last = ln.runs[ln.runs.length - 1]
      if (/\s+$/.test(last.run.text)) {
        const trimmed = last.run.text.replace(/\s+$/, '')
        const removed = last.run.text.length - trimmed.length
        if (removed > 0) {
          last.run.text = trimmed
          // Approximate width adjustment (ok for trailing spaces)
          // Recomputing exactly is overkill; visual difference negligible.
        }
      }
    }
  }
  return lines
}

function bgRect(c: TextBlockConfig, w: number, h: number, theme: Record<string, string>): string {
  if (!c.backgroundStyle || c.backgroundStyle === 'none') {
    if (c.backgroundColor && c.backgroundColor !== 'transparent') {
      return `<rect width="${w}" height="${h}" rx="8" fill="${esc(resolveColor(c.backgroundColor, theme, c.backgroundColor))}"/>`
    }
    return ''
  }
  const accent = theme['--accent'] || '#2563eb'
  switch (c.backgroundStyle) {
    case 'card':
      return `<rect width="${w}" height="${h}" rx="8" fill="${esc(c.backgroundColor && c.backgroundColor !== 'transparent' ? resolveColor(c.backgroundColor, theme, c.backgroundColor) : 'rgba(30,40,55,0.45)')}" stroke="rgba(255,255,255,0.06)"/>`
    case 'glass':
      return `<rect width="${w}" height="${h}" rx="8" fill="rgba(20,30,45,0.30)" stroke="rgba(255,255,255,0.10)"/>`
    case 'paper':
      return `<rect width="${w}" height="${h}" rx="8" fill="${esc(c.backgroundColor && c.backgroundColor !== 'transparent' ? resolveColor(c.backgroundColor, theme, c.backgroundColor) : 'rgba(245,247,250,0.06)')}" stroke="rgba(255,255,255,0.04)"/>`
    case 'strip':
      return `<rect width="${w}" height="${h}" rx="2" fill="rgba(31,111,160,0.10)"/><rect width="3" height="${h}" fill="${esc(accent)}"/>`
    case 'highlight':
      return `<rect width="${w}" height="${h}" rx="6" fill="rgba(31,111,160,0.10)" stroke="rgba(31,111,160,0.18)"/>`
    default:
      return ''
  }
}

function renderTextBlock(block: Block, ctx: ExportCtx): string {
  const c = (block.config || {}) as unknown as TextBlockConfig
  const w = block.bounds.w
  const h = block.bounds.h
  const fontFamily = fontFamilyFor(c.fontFamily, ctx.theme)
  const fontSize = c.fontSize || 14
  const baseWeight = c.fontWeight || 400
  const lineHeight = c.lineHeight || 1.5
  const letterSpacing = c.letterSpacing || 0
  const align = c.alignment || 'left'
  const padding = c.padding ?? (c.backgroundStyle && c.backgroundStyle !== 'none' ? 16 : 8)
  const padX = padding + (c.backgroundStyle === 'strip' ? 6 : 0)
  const padY = padding * 0.85
  const textColor = resolveColor(c.bodyColor, ctx.theme, ctx.theme['--text'] || '#e7ecf2')
  const innerW = Math.max(10, w - padX * 2)

  const parts: string[] = []
  const bg = bgRect(c, w, h, ctx.theme)
  if (bg) parts.push(bg)

  const html = c.content || ''
  if (!html.trim()) return parts.join('')

  const runs = htmlToRuns(html)
  const lines = wrapRuns(runs, fontSize, baseWeight, fontFamily, innerW, letterSpacing, c.textTransform)

  const totalH = lines.length * fontSize * lineHeight
  let y = padY + fontSize  // baseline of first line
  if (c.verticalAlign === 'middle') y = (h - totalH) / 2 + fontSize
  else if (c.verticalAlign === 'bottom') y = h - padY - (lines.length - 1) * fontSize * lineHeight

  const xLeft = padX
  const xCenter = w / 2
  const xRight = w - padX

  for (const line of lines) {
    let xCursor: number
    let textAnchor: string
    if (align === 'center') { xCursor = xCenter - line.width / 2; textAnchor = 'start' }
    else if (align === 'right') { xCursor = xRight - line.width; textAnchor = 'start' }
    else { xCursor = xLeft; textAnchor = 'start' }

    const tspans: string[] = []
    let runX = xCursor
    for (const pr of line.runs) {
      const s = pr.run.style
      const weight = s.bold ? 700 : baseWeight
      const fs = c.italic || s.italic ? 'italic' : 'normal'
      const decorParts: string[] = []
      if (c.underline || s.underline) decorParts.push('underline')
      if (c.strikethrough || s.strike) decorParts.push('line-through')
      const decor = decorParts.join(' ')
      const fill = s.color ? resolveColor(s.color, ctx.theme, s.color) : textColor
      tspans.push(
        `<tspan x="${runX.toFixed(2)}" font-weight="${weight}" font-style="${fs}" fill="${esc(fill)}"${decor ? ` text-decoration="${decor}"` : ''}>${esc(pr.run.text)}</tspan>`
      )
      runX += pr.width
    }
    parts.push(
      `<text y="${y.toFixed(2)}" font-family="${esc(fontFamily)}" font-size="${fontSize}" fill="${esc(textColor)}" text-anchor="${textAnchor}"${letterSpacing ? ` letter-spacing="${letterSpacing}"` : ''}>${tspans.join('')}</text>`
    )
    y += fontSize * lineHeight
  }

  return parts.join('')
}

/* ── Card block ─────────────────────────────────────────────────────── */

function renderCardBlock(block: Block, ctx: ExportCtx): string {
  const c = (block.config || {}) as unknown as CardBlockConfig
  const w = block.bounds.w
  const h = block.bounds.h
  const accent = c.color || '#4fd087'
  const bg = c.backgroundColor || 'rgba(79,208,135,0.10)'
  const fontFamily = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
  const condensed = ctx.theme['--font-condensed'] || fontFamily
  const titleColor = ctx.theme['--text-subtle'] || '#5a6878'
  const valueColor = ctx.theme['--text'] || '#1a1a1a'

  const padX = 18
  const titleSize = 10
  const valueSize = 34
  const subSize = 11
  const gap = 4
  const totalH = titleSize * 1.3 + gap + valueSize * 1.15 + (c.subtitle ? gap + subSize * 1.3 : 0)
  let y = (h - totalH) / 2 + titleSize * 1.3

  const parts: string[] = [
    `<rect width="${w}" height="${h}" rx="8" fill="${esc(bg)}"/>`,
    `<rect width="3" height="${h}" fill="${esc(accent)}"/>`,
  ]
  if (c.title) {
    parts.push(
      `<text x="${padX}" y="${y.toFixed(2)}" font-family="${esc(fontFamily)}" font-size="${titleSize}" font-weight="500" fill="${esc(titleColor)}" letter-spacing="0.8">${esc(String(c.title).toUpperCase())}</text>`
    )
  }
  y += gap + valueSize
  if (c.value !== undefined && c.value !== null) {
    parts.push(
      `<text x="${padX}" y="${y.toFixed(2)}" font-family="${esc(condensed)}" font-size="${valueSize}" font-weight="600" fill="${esc(valueColor)}">${esc(String(c.value))}</text>`
    )
  }
  if (c.subtitle) {
    y += gap + subSize * 1.3
    parts.push(
      `<text x="${padX}" y="${y.toFixed(2)}" font-family="${esc(fontFamily)}" font-size="${subSize}" font-weight="500" fill="${esc(accent)}">${esc(c.subtitle)}</text>`
    )
  }
  return parts.join('')
}

/* ── Divider block ──────────────────────────────────────────────────── */

function renderDividerBlock(block: Block, ctx: ExportCtx): string {
  const c = (block.config || {}) as unknown as DividerBlockConfig
  const w = block.bounds.w
  const h = block.bounds.h
  const isVertical = c.orientation === 'vertical'
  const color = resolveColor(c.color, ctx.theme, ctx.theme['--border'] || '#7a8a9a')
  const thickness = c.thickness || 1
  const dasharray = c.style === 'dashed' ? '6 4' : c.style === 'dotted' ? '2 2' : undefined

  if (c.label) {
    const fontFamily = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    const labelColor = ctx.theme['--text-subtle'] || '#5a6878'
    const labelSize = 10
    const labelW = c.label.length * labelSize * 0.55 + 16
    const cx = w / 2
    const cy = h / 2
    const lineAttrs = `stroke="${esc(color)}" stroke-width="${thickness}" stroke-opacity="0.3"${dasharray ? ` stroke-dasharray="${dasharray}"` : ''}`
    if (isVertical) {
      return [
        `<line x1="${cx}" y1="0" x2="${cx}" y2="${(cy - labelW / 2).toFixed(2)}" ${lineAttrs}/>`,
        `<text x="${cx}" y="${cy + labelSize / 2 - 2}" text-anchor="middle" font-family="${esc(fontFamily)}" font-size="${labelSize}" fill="${esc(labelColor)}">${esc(c.label)}</text>`,
        `<line x1="${cx}" y1="${(cy + labelW / 2).toFixed(2)}" x2="${cx}" y2="${h}" ${lineAttrs}/>`,
      ].join('')
    }
    return [
      `<line x1="0" y1="${cy}" x2="${(cx - labelW / 2).toFixed(2)}" y2="${cy}" ${lineAttrs}/>`,
      `<text x="${cx}" y="${cy + labelSize / 2 - 2}" text-anchor="middle" font-family="${esc(fontFamily)}" font-size="${labelSize}" fill="${esc(labelColor)}">${esc(c.label)}</text>`,
      `<line x1="${(cx + labelW / 2).toFixed(2)}" y1="${cy}" x2="${w}" y2="${cy}" ${lineAttrs}/>`,
    ].join('')
  }
  const lineAttrs = `stroke="${esc(color)}" stroke-width="${thickness}" stroke-opacity="0.2"${dasharray ? ` stroke-dasharray="${dasharray}"` : ''}`
  if (isVertical) {
    return `<line x1="${w / 2}" y1="0" x2="${w / 2}" y2="${h}" ${lineAttrs}/>`
  }
  return `<line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" ${lineAttrs}/>`
}

/* ── Shape helpers ──────────────────────────────────────────────────── */

function shadeHex(hex: string, percent: number): string {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (h.length !== 6) return hex
  const num = parseInt(h, 16)
  const r = Math.max(0, Math.min(255, ((num >> 16) & 0xff) + (255 * percent) / 100))
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + (255 * percent) / 100))
  const b = Math.max(0, Math.min(255, (num & 0xff) + (255 * percent) / 100))
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
}

/* ── Shape block ────────────────────────────────────────────────────── */

function renderShapeBlock(block: Block, ctx: ExportCtx): string {
  const c = (block.config || {}) as unknown as import('../types').ShapeBlockConfig
  const w = block.bounds.w
  const h = block.bounds.h
  const shape = c.shape || 'rectangle'
  const baseFill = resolveColor(c.fillColor, ctx.theme, ctx.theme['--accent'] || '#2563eb')
  const stroke = resolveColor(c.strokeColor, ctx.theme, 'transparent')
  const sw = c.strokeWidth ?? 0
  const opacity = c.opacity ?? 1
  const rot = c.rotation ?? 0
  const rx = c.rounded ?? 0

  /* Gradient fill */
  let fill = baseFill
  if (c.gradient && baseFill && !baseFill.startsWith('url(')) {
    const gradId = `sg-${block.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
    const gradTo = c.gradientTo || shadeHex(baseFill, -25)
    ctx.defs.push(
      `<linearGradient id="${esc(gradId)}" x1="0" y1="0" x2="1" y2="1"` +
      ` gradientTransform="rotate(${c.gradientAngle ?? 135} 0.5 0.5)">` +
      `<stop offset="0%" stop-color="${esc(baseFill)}"/>` +
      `<stop offset="100%" stop-color="${esc(gradTo)}"/></linearGradient>`
    )
    fill = `url(#${esc(gradId)})`
  }

  const transform = rot ? ` transform="rotate(${rot} ${w / 2} ${h / 2})"` : ''
  const strokeAttr = sw > 0 ? ` stroke="${esc(stroke)}" stroke-width="${sw}"` : ''

  let el = ''
  if (shape === 'rectangle') {
    el = `<rect x="0" y="0" width="${w}" height="${h}" rx="${rx}" fill="${esc(fill)}"${strokeAttr} opacity="${opacity}"${transform}/>`
  } else if (shape === 'circle') {
    const r = Math.min(w, h) / 2
    el = `<circle cx="${w / 2}" cy="${h / 2}" r="${r}" fill="${esc(fill)}"${strokeAttr} opacity="${opacity}"${transform}/>`
  } else if (shape === 'ellipse') {
    el = `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${esc(fill)}"${strokeAttr} opacity="${opacity}"${transform}/>`
  } else if (shape === 'line') {
    const x1 = c.lineX1 ?? 0
    const y1 = c.lineY1 ?? h / 2
    const x2 = c.lineX2 ?? w
    const y2 = c.lineY2 ?? h / 2
    const lineColor = stroke !== 'transparent' ? stroke : baseFill
    const lsw = sw || 3
    const dash = c.lineStyle === 'dashed'
      ? `${lsw * 4} ${lsw * 3}`
      : c.lineStyle === 'dotted'
      ? `${lsw * 1.2} ${lsw * 2}`
      : undefined
    const aid = `la-${block.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
    if (c.lineEndArrow) {
      ctx.defs.push(
        `<marker id="${esc(aid)}-e" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8"` +
        ` orient="auto-start-reverse" markerUnits="strokeWidth"><path d="M0,0 L10,5 L0,10 Z" fill="${esc(lineColor)}"/></marker>`
      )
    }
    if (c.lineStartArrow) {
      ctx.defs.push(
        `<marker id="${esc(aid)}-s" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8"` +
        ` orient="auto-start-reverse" markerUnits="strokeWidth"><path d="M0,0 L10,5 L0,10 Z" fill="${esc(lineColor)}"/></marker>`
      )
    }
    el = `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${esc(lineColor)}" stroke-width="${lsw}"` +
      ` stroke-linecap="${dash ? 'butt' : 'round'}"${dash ? ` stroke-dasharray="${dash}"` : ''}` +
      ` opacity="${opacity}"${transform}` +
      `${c.lineStartArrow ? ` marker-start="url(#${esc(aid)}-s)"` : ''}` +
      `${c.lineEndArrow ? ` marker-end="url(#${esc(aid)}-e)"` : ''}/>`
  } else {
    const cx = w / 2
    const cy = h / 2
    let d = ''
    switch (shape) {
      case 'triangle':
        d = `M${cx},0 L${w},${h} L0,${h} Z`
        break
      case 'diamond':
        d = `M${cx},0 L${w},${cy} L${cx},${h} L0,${cy} Z`
        break
      case 'pentagon': {
        const r = Math.min(w, h) / 2
        const pts: string[] = []
        for (let i = 0; i < 5; i++) {
          const a = (Math.PI * 2 * i) / 5 - Math.PI / 2
          pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`)
        }
        d = `M${pts.join(' L')} Z`
        break
      }
      case 'hexagon': {
        const r = Math.min(w, h) / 2
        const pts: string[] = []
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI * 2 * i) / 6
          pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`)
        }
        d = `M${pts.join(' L')} Z`
        break
      }
      case 'star': {
        const outer = Math.min(w, h) / 2
        const inner = outer * 0.45
        const pts: string[] = []
        for (let i = 0; i < 10; i++) {
          const a = (Math.PI * i) / 5 - Math.PI / 2
          const r = i % 2 === 0 ? outer : inner
          pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`)
        }
        d = `M${pts.join(' L')} Z`
        break
      }
      case 'heart': {
        const s = Math.min(w, h)
        const scaleX = w / s
        d = `M${cx},${h * 0.85} C${cx - s * 0.45 * scaleX},${h * 0.55} ${cx - s * 0.45 * scaleX},${h * 0.10} ${cx},${h * 0.32} C${cx + s * 0.45 * scaleX},${h * 0.10} ${cx + s * 0.45 * scaleX},${h * 0.55} ${cx},${h * 0.85} Z`
        break
      }
      case 'cloud': {
        const r1 = h * 0.30; const r2 = h * 0.36; const r3 = h * 0.30
        d = `M${w * 0.18},${h * 0.78} a${r1},${r1} 0 1,1 0,-${r1 * 1.4} a${r2},${r2} 0 0,1 ${w * 0.32},-${r2 * 0.6} a${r3},${r3} 0 0,1 ${w * 0.32},${r3 * 0.4} a${r1},${r1} 0 1,1 0,${r1 * 1.4} Z`
        break
      }
      case 'shield':
        d = `M${cx},0 L${w},${h * 0.18} L${w},${h * 0.55} Q${w},${h * 0.92} ${cx},${h} Q0,${h * 0.92} 0,${h * 0.55} L0,${h * 0.18} Z`
        break
      case 'speech': {
        const tail = `L${w * 0.18},${h * 0.85} L${w * 0.10},${h} L${w * 0.34},${h * 0.85}`
        d = `M${w * 0.04},0 L${w * 0.96},0 Q${w},0 ${w},${h * 0.04} L${w},${h * 0.81} Q${w},${h * 0.85} ${w * 0.96},${h * 0.85} ${tail} L${w * 0.04},${h * 0.85} Q0,${h * 0.85} 0,${h * 0.81} L0,${h * 0.04} Q0,0 ${w * 0.04},0 Z`
        break
      }
      case 'callout': {
        const cr = Math.min(8, h * 0.06)
        const tipW = Math.min(20, w * 0.16)
        const tipH = Math.min(14, h * 0.14)
        const baseH = h - tipH
        d = `M${cr},0 L${w - cr},0 Q${w},0 ${w},${cr} L${w},${baseH - cr} Q${w},${baseH} ${w - cr},${baseH} L${cx + tipW / 2},${baseH} L${cx},${h} L${cx - tipW / 2},${baseH} L${cr},${baseH} Q0,${baseH} 0,${baseH - cr} L0,${cr} Q0,0 ${cr},0 Z`
        break
      }
      case 'ribbon': {
        const slot = h * 0.18; const fold = w * 0.06
        d = `M0,${slot} L${w * 0.5},0 L${w},${slot} L${w - fold},${h * 0.5} L${w},${h - slot} L${w * 0.5},${h} L0,${h - slot} L${fold},${h * 0.5} Z`
        break
      }
      case 'blob': {
        const br = Math.min(w, h) * 0.45
        d = `M${cx - br * 0.7},${cy - br * 0.4} C${cx - br},${cy - br * 1.1} ${cx + br * 0.4},${cy - br * 1.2} ${cx + br * 0.9},${cy - br * 0.4} C${cx + br * 1.3},${cy + br * 0.2} ${cx + br * 0.6},${cy + br} ${cx + br * 0.1},${cy + br * 0.95} C${cx - br * 0.7},${cy + br * 1.05} ${cx - br * 1.1},${cy + br * 0.3} ${cx - br * 0.7},${cy - br * 0.4} Z`
        break
      }
      case 'cross': {
        const t = Math.min(w, h) * 0.30
        d = `M${cx - t / 2},0 L${cx + t / 2},0 L${cx + t / 2},${cy - t / 2} L${w},${cy - t / 2} L${w},${cy + t / 2} L${cx + t / 2},${cy + t / 2} L${cx + t / 2},${h} L${cx - t / 2},${h} L${cx - t / 2},${cy + t / 2} L0,${cy + t / 2} L0,${cy - t / 2} L${cx - t / 2},${cy - t / 2} Z`
        break
      }
      case 'arrow-right': {
        const head = Math.min(w, h) * 0.35
        const bodyY = h * 0.35
        d = `M0,${bodyY} L${w - head},${bodyY} L${w - head},0 L${w},${h / 2} L${w - head},${h} L${w - head},${h - bodyY} L0,${h - bodyY} Z`
        break
      }
      case 'arrow-left': {
        const head = Math.min(w, h) * 0.35
        const bodyY = h * 0.35
        d = `M${w},${bodyY} L${head},${bodyY} L${head},0 L0,${h / 2} L${head},${h} L${head},${h - bodyY} L${w},${h - bodyY} Z`
        break
      }
      case 'arrow-up': {
        const head = Math.min(w, h) * 0.35
        const bodyX = w * 0.35
        d = `M${bodyX},${h} L${bodyX},${head} L0,${head} L${w / 2},0 L${w},${head} L${w - bodyX},${head} L${w - bodyX},${h} Z`
        break
      }
      case 'arrow-down': {
        const head = Math.min(w, h) * 0.35
        const bodyX = w * 0.35
        d = `M${bodyX},0 L${bodyX},${h - head} L0,${h - head} L${w / 2},${h} L${w},${h - head} L${w - bodyX},${h - head} L${w - bodyX},0 Z`
        break
      }
      case 'arrow-double': {
        const head = Math.min(w, h) * 0.30
        const bodyY = h * 0.35
        d = `M0,${h / 2} L${head},0 L${head},${bodyY} L${w - head},${bodyY} L${w - head},0 L${w},${h / 2} L${w - head},${h} L${w - head},${h - bodyY} L${head},${h - bodyY} L${head},${h} Z`
        break
      }
    }
    el = `<path d="${d}" fill="${esc(fill)}"${strokeAttr} opacity="${opacity}"${transform}/>`
  }

  if (c.shadow) {
    const fid = `shape-shadow-${block.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
    ctx.defs.push(`<filter id="${fid}" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="rgba(0,0,0,0.35)"/></filter>`)
    return `<g filter="url(#${fid})">${el}</g>`
  }
  return el
}

/* ── Image block ────────────────────────────────────────────────────── */

async function urlToDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return url
  const resp = await fetch(url, { mode: 'cors' })
  const blob = await resp.blob()
  return await new Promise<string>((res, rej) => {
    const fr = new FileReader()
    fr.onload = () => res(String(fr.result))
    fr.onerror = rej
    fr.readAsDataURL(blob)
  })
}

async function renderImageBlock(block: Block, ctx: ExportCtx): Promise<string> {
  const c = (block.config || {}) as unknown as ImageBlockConfig
  const w = block.bounds.w
  const h = block.bounds.h
  if (!c.src) {
    return `<rect width="${w}" height="${h}" fill="#1a2230"/>`
  }
  let href = c.src
  try {
    href = await urlToDataUrl(c.src)
  } catch {
    /* fall back to external URL */
  }
  const preserveAspect =
    c.fit === 'cover' ? 'xMidYMid slice' : c.fit === 'fill' ? 'none' : 'xMidYMid meet'

  const parts: string[] = []
  const mask = c.mask || 'none'
  const rx = mask === 'none' ? (c.borderRadius || 0) : 0

  // Clip / mask
  let clipAttr = ''
  if (mask !== 'none') {
    const maskId = `mask-img-${block.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
    const path = maskPathFor(mask, w, h)
    ctx.defs.push(`<clipPath id="${esc(maskId)}"><path d="${path}"/></clipPath>`)
    clipAttr = ` clip-path="url(#${esc(maskId)})"`
  } else if (rx) {
    const clipId = `clip-img-${block.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
    ctx.defs.push(`<clipPath id="${esc(clipId)}"><rect width="${w}" height="${h}" rx="${rx}"/></clipPath>`)
    clipAttr = ` clip-path="url(#${esc(clipId)})"`
  }

  // Filter
  let filterAttr = ''
  const brightness = c.brightness ?? 100
  const contrast = c.contrast ?? 100
  const saturation = c.saturation ?? 100
  const grayscale = c.grayscale ?? 0
  const blur = c.blur ?? 0
  const hasFilter = brightness !== 100 || contrast !== 100 || saturation !== 100 || grayscale > 0 || blur > 0
  if (hasFilter) {
    const fid = `flt-img-${block.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
    const filters: string[] = []
    // Brightness + contrast via linear matrix on RGB
    const b = brightness / 100
    const ct = contrast / 100
    const s = saturation / 100
    const g = grayscale / 100
    // Combine brightness, contrast, saturation, grayscale into one color matrix
    // Grayscale luminance weights: R=0.2126, G=0.7152, B=0.0722
    const rR = (0.2126 + 0.7874 * s) * b * ct
    const rG = (0.2126 - 0.2126 * s) * b * ct
    const rB = (0.2126 - 0.2126 * s) * b * ct
    const gR = (0.7152 - 0.7152 * s) * b * ct
    const gG = (0.7152 + 0.2848 * s) * b * ct
    const bR = (0.0722 - 0.0722 * s) * b * ct
    const bG = (0.0722 - 0.0722 * s) * b * ct
    const bB = (0.0722 + 0.9278 * s) * b * ct
    // Interpolate toward grayscale
    const mRR = rR * (1 - g) + 0.2126 * g
    const mRG = gR * (1 - g) + 0.2126 * g
    const mRB = bR * (1 - g) + 0.2126 * g
    const mGR = rG * (1 - g) + 0.7152 * g
    const mGG = gG * (1 - g) + 0.7152 * g
    const mGB = bG * (1 - g) + 0.7152 * g
    const mBR = rB * (1 - g) + 0.0722 * g
    const mBG = bG * (1 - g) + 0.0722 * g
    const mBB = bB * (1 - g) + 0.0722 * g
    filters.push(`<feColorMatrix type="matrix" values="${[mRR,mRG,mRB,0,0,mGR,mGG,mGB,0,0,mBR,mBG,mBB,0,0,0,0,0,1,0].map(v=>v.toFixed(4)).join(' ')}"/>`)
    if (blur > 0) {
      filters.push(`<feGaussianBlur stdDeviation="${blur}"/>`)
    }
    ctx.defs.push(`<filter id="${esc(fid)}" x="-10%" y="-10%" width="120%" height="120%">${filters.join('')}</filter>`)
    filterAttr = ` filter="url(#${esc(fid)})"`
  }

  parts.push(`<image href="${esc(href)}" width="${w}" height="${h}" preserveAspectRatio="${preserveAspect}"${clipAttr}${filterAttr}/>`)

  // Border
  const borderWidth = c.borderWidth ?? 0
  const borderColor = c.borderColor || 'var(--accent)'
  if (borderWidth > 0) {
    const resolvedBorder = resolveColor(borderColor, ctx.theme, ctx.theme['--accent'] || '#5b8def')
    if (mask !== 'none') {
      const path = maskPathFor(mask, w, h)
      parts.push(`<path d="${path}" fill="none" stroke="${esc(resolvedBorder)}" stroke-width="${borderWidth}"/>`)
    } else {
      parts.push(`<rect width="${w}" height="${h}" rx="${rx}" fill="none" stroke="${esc(resolvedBorder)}" stroke-width="${borderWidth}"/>`)
    }
  }

  // Caption
  if (c.caption) {
    const capColor = c.captionColor || '#ffffff'
    const gradId = `cap-grad-${block.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
    ctx.defs.push(`<linearGradient id="${esc(gradId)}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="rgba(0,0,0,0.65)"/><stop offset="1" stop-color="rgba(0,0,0,0)"/></linearGradient>`)
    parts.push(`<rect x="0" y="${h - 28}" width="${w}" height="28" fill="url(#${esc(gradId)})"/>`)
    parts.push(`<text x="10" y="${h - 8}" font-family="system-ui, sans-serif" font-size="10" font-weight="500" fill="${esc(capColor)}">${esc(c.caption)}</text>`)
  }

  return parts.join('')
}

/* ── Connector block ────────────────────────────────────────────────── */

function renderConnectorBlock(block: Block, allBlocks: Block[], ctx: ExportCtx): string {
  const c = (block.config || {}) as unknown as ConnectorBlockConfig
  const fromBlock = c.fromAnchor?.blockId ? allBlocks.find((b) => b.id === c.fromAnchor!.blockId) : undefined
  const toBlock = c.toAnchor?.blockId ? allBlocks.find((b) => b.id === c.toAnchor!.blockId) : undefined
  const fallbackFrom = { x: block.bounds.x, y: block.bounds.y + block.bounds.h / 2 }
  const fallbackTo = { x: block.bounds.x + block.bounds.w, y: block.bounds.y + block.bounds.h / 2 }
  const fromAbs = getAnchorPoint(fromBlock, c.fromAnchor || {}, fallbackFrom)
  const toAbs = getAnchorPoint(toBlock, c.toAnchor || {}, fallbackTo)
  // Translate to block-local coords (BlockRenderer wraps in transform, but
  // since connector groups in svgExport are translated by block.bounds, we
  // emit relative-to-bounds coords here).
  const from = { x: fromAbs.x - block.bounds.x, y: fromAbs.y - block.bounds.y }
  const to = { x: toAbs.x - block.bounds.x, y: toAbs.y - block.bounds.y }

  const color = resolveColor(c.color, ctx.theme, ctx.theme['--accent'] || '#5b8def')
  const sw = c.strokeWidth ?? 2
  const opacity = c.opacity ?? 1
  const style = c.style || 'curved'
  const curvature = c.curvature ?? 0.5
  const bow = c.bow ?? 0.4
  const dashKind = c.dashPattern || (c.dashed ? 'dashed' : 'solid')
  const dash =
    dashKind === 'dashed' ? `${sw * 4} ${sw * 3}` :
    dashKind === 'dotted' ? `${sw * 1.2} ${sw * 2}` :
    dashKind === 'dashLong' ? `${sw * 8} ${sw * 4}` :
    undefined

  const startM = c.startMarker || 'none'
  const endM = c.endMarker || (c.arrowEnd !== false ? 'arrow' : 'none')
  let markerStartAttr = ''
  let markerEndAttr = ''
  if (startM !== 'none') {
    const id = `cm-s-${block.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
    ctx.defs.push(buildMarkerSVG(id, startM, color, c.startMarkerSize ?? 1))
    markerStartAttr = ` marker-start="url(#${id})"`
  }
  if (endM !== 'none') {
    const id = `cm-e-${block.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
    ctx.defs.push(buildMarkerSVG(id, endM, color, c.endMarkerSize ?? 1))
    markerEndAttr = ` marker-end="url(#${id})"`
  }

  let filterAttr = ''
  if (c.shadow !== false) {
    const fid = `cf-${block.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`
    ctx.defs.push(`<filter id="${fid}" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="rgba(0,0,0,0.40)" flood-opacity="0.7"/></filter>`)
    filterAttr = ` filter="url(#${fid})"`
  }

  const d = buildPathD(from, to, style, curvature, bow)
  const path = `<path d="${d}" fill="none" stroke="${esc(color)}" stroke-width="${sw}" stroke-linecap="${dash ? 'butt' : 'round'}" stroke-linejoin="round"${dash ? ` stroke-dasharray="${dash}"` : ''}${opacity !== 1 ? ` opacity="${opacity}"` : ''}${markerStartAttr}${markerEndAttr}${filterAttr}/>`

  let label = ''
  if (c.label) {
    const fontFamily = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    const fs = c.labelFontSize || 11
    const w = c.label.length * fs * 0.55 + 12
    const h = fs + 6
    const cxl = (from.x + to.x) / 2
    const cyl = (from.y + to.y) / 2
    const lx = cxl - w / 2
    const ly = cyl - h / 2
    const labelColor = c.labelColor || resolveColor('var(--text)', ctx.theme, '#e7ecf2')
    const labelBg = c.labelBackground || 'rgba(15,25,40,0.92)'
    label = `<g transform="translate(${lx.toFixed(2)},${ly.toFixed(2)})"><rect width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="4" fill="${esc(labelBg)}" stroke="rgba(255,255,255,0.08)" stroke-width="0.5"/><text x="${(w/2).toFixed(2)}" y="${(h - 4).toFixed(2)}" text-anchor="middle" font-family="${esc(fontFamily)}" font-size="${fs}" fill="${esc(labelColor)}" font-weight="600">${esc(c.label)}</text></g>`
  }
  return path + label
}

/* ── Chart block: raster fallback ──────────────────────────────────── */

async function renderChartBlock(block: Block): Promise<string> {
  return renderRasterFallback(block)
}

/* ── Rasterized fallback for unsupported block types ────────────────── */

async function renderRasterFallback(block: Block): Promise<string> {
  const w = block.bounds.w
  const h = block.bounds.h
  const dom = document.querySelector(
    `[data-block-id="${CSS.escape(block.id)}"] .block-content-wrap`
  ) as HTMLElement | null
  if (!dom) {
    return `<rect width="${w}" height="${h}" fill="#1a2230" stroke="#2d3742"/>`
  }
  try {
    const png = await toPng(dom, {
      pixelRatio: 3,
      backgroundColor: 'transparent',
      cacheBust: true,
    })
    return `<image href="${esc(png)}" width="${w}" height="${h}" preserveAspectRatio="none"/>`
  } catch {
    return `<rect width="${w}" height="${h}" fill="#1a2230"/>`
  }
}

/* ── Main entry ─────────────────────────────────────────────────────── */

export async function buildSVG(
  spec: InfographicSpec,
  selection: ExportSelection
): Promise<string> {
  const theme = readThemeColors()
  const ctx: ExportCtx = { theme, defs: [] }

  const visible = spec.blocks.filter((b) => intersects(b, selection))
  // Connectors render below content blocks (matches InfographicCanvas).
  visible.sort((a, b) => {
    if (a.type === 'connector' && b.type !== 'connector') return -1
    if (a.type !== 'connector' && b.type === 'connector') return 1
    return (a.zIndex ?? 0) - (b.zIndex ?? 0)
  })

  const groups: string[] = []
  for (const block of visible) {
    let inner = ''
    try {
      switch (block.type) {
        case 'map':       inner = await renderMapBlock(block, ctx); break
        case 'text':      inner = renderTextBlock(block, ctx); break
        case 'card': {
          const tpl = (block.config as CardBlockConfig)?.template
          if (tpl && tpl !== 'stat') inner = await renderRasterFallback(block)
          else inner = renderCardBlock(block, ctx)
          break
        }
        case 'divider':   inner = renderDividerBlock(block, ctx); break
        case 'image':     inner = await renderImageBlock(block, ctx); break
        case 'shape':     inner = renderShapeBlock(block, ctx); break
        case 'connector': inner = renderConnectorBlock(block, spec.blocks, ctx); break
        case 'chart':     inner = await renderChartBlock(block); break
        default:          inner = await renderRasterFallback(block); break
      }
    } catch (err) {
      console.warn(`SVG export: block ${block.id} (${block.type}) failed`, err)
      inner = `<rect width="${block.bounds.w}" height="${block.bounds.h}" fill="#1a2230"/>`
    }
    groups.push(
      `<g transform="translate(${block.bounds.x} ${block.bounds.y})" data-block-id="${esc(block.id)}" data-block-type="${esc(block.type)}">${inner}</g>`
    )
  }

  const canvasBg = resolveColor(spec.canvas?.background, theme, theme['--surface'] || '#ffffff')

  const selClipId = 'export-selection-clip'
  const defs = [
    `<clipPath id="${selClipId}"><rect x="${selection.x}" y="${selection.y}" width="${selection.w}" height="${selection.h}"/></clipPath>`,
    ...ctx.defs,
  ]

  const svg = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"`,
    `  width="${selection.w.toFixed(1)}" height="${selection.h.toFixed(1)}"`,
    `  viewBox="${selection.x.toFixed(1)} ${selection.y.toFixed(1)} ${selection.w.toFixed(1)} ${selection.h.toFixed(1)}">`,
    `  <defs>${defs.join('')}</defs>`,
    `  <rect x="${selection.x}" y="${selection.y}" width="${selection.w}" height="${selection.h}" fill="${esc(canvasBg)}"/>`,
    `  <g clip-path="url(#${selClipId})">`,
    `    ${groups.join('\n    ')}`,
    `  </g>`,
    `</svg>`,
  ].join('\n')

  // Debug: validate SVG by parsing it
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(svg, 'image/svg+xml')
    const parseError = doc.querySelector('parsererror')
    if (parseError) {
      console.error('SVG PARSE ERROR:', parseError.textContent)
      // Log the problematic line
      const lines = svg.split('\n')
      console.error('Line 9:', lines[8] || 'N/A')
      console.error('Line 10:', lines[9] || 'N/A')
    }
  } catch (e) {
    /* ignore validation errors in environments without DOMParser */
  }

  return svg
}

/* ── SVG → raster pipeline (used for PNG/JPG/PDF) ───────────────────── */

/** Rasterize an SVG string to a Canvas at scale × natural dimensions. */
export async function svgToCanvas(svg: string, scale: number): Promise<HTMLCanvasElement> {
  // Pull width/height off the root tag so we know the natural size.
  const wMatch = svg.match(/<svg[^>]*\swidth="([\d.]+)"/)
  const hMatch = svg.match(/<svg[^>]*\sheight="([\d.]+)"/)
  const baseW = wMatch ? parseFloat(wMatch[1]) : 800
  const baseH = hMatch ? parseFloat(hMatch[1]) : 600

  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.decoding = 'sync'
    img.src = url
    await new Promise<void>((res, rej) => {
      img.onload = () => res()
      img.onerror = (e) => rej(e)
    })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(baseW * scale)
    canvas.height = Math.round(baseH * scale)
    const c = canvas.getContext('2d')!
    c.imageSmoothingEnabled = true
    c.imageSmoothingQuality = 'high'
    c.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function svgToPng(svg: string, scale: number): Promise<Blob> {
  const canvas = await svgToCanvas(svg, scale)
  return await new Promise<Blob>((res, rej) => {
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob returned null'))), 'image/png')
  })
}

export async function svgToJpeg(svg: string, scale: number, bgColor = '#ffffff'): Promise<Blob> {
  const tmp = await svgToCanvas(svg, scale)
  // JPEG has no alpha — paint a background underneath.
  const canvas = document.createElement('canvas')
  canvas.width = tmp.width
  canvas.height = tmp.height
  const c = canvas.getContext('2d')!
  c.fillStyle = bgColor
  c.fillRect(0, 0, canvas.width, canvas.height)
  c.drawImage(tmp, 0, 0)
  return await new Promise<Blob>((res, rej) => {
    canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob returned null'))), 'image/jpeg', 0.95)
  })
}

export async function buildPagePreview(spec: InfographicSpec, width = 120, height = 78): Promise<string> {
  const selection = { x: 0, y: 0, w: spec.canvas.width, h: spec.canvas.height }
  const svg = await buildSVG(spec, selection)
  const scale = Math.min(width / selection.w, height / selection.h)
  const canvas = await svgToCanvas(svg, scale)
  return canvas.toDataURL('image/png')
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
