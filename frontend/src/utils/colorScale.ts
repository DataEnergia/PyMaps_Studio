/**
 * Color-scale utilities inspired by Observatorio PR project.
 * Provides quintile (5-bucket) color scales, centroid calc, and ready-to-use palettes.
 */

import type { ChoroplethRow } from '../studio/types'

export const QUINTIL_COLORS_BLUE = ['#e8f0fe', '#93b4f0', '#5b8dee', '#2563eb', '#1e40af', '#0f2469']
export const QUINTIL_COLORS_ORANGE = ['#fff7ed', '#fed7aa', '#fb923c', '#ea580c', '#c2410c', '#7c2d12']
export const QUINTIL_COLORS_GREEN = ['#dcfce7', '#86efac', '#22c55e', '#16a34a', '#15803d', '#14532d']
export const QUINTIL_COLORS_PURPLE = ['#f3e8ff', '#d8b4fe', '#a855f7', '#9333ea', '#7e22ce', '#581c87']
export const QUINTIL_COLORS_RED = ['#fee2e2', '#fca5a5', '#ef4444', '#dc2626', '#b91c1c', '#7f1d1d']

// Extended curated palette library
export const QUINTIL_COLORS_TEAL = ['#f0fdfa', '#99f6e4', '#2dd4bf', '#14b8a6', '#0f766e', '#134e4a']
export const QUINTIL_COLORS_AMBER = ['#fffbeb', '#fde68a', '#f59e0b', '#d97706', '#b45309', '#78350f']
export const QUINTIL_COLORS_EMERALD = ['#ecfdf5', '#6ee7b7', '#10b981', '#059669', '#047857', '#064e3b']
export const QUINTIL_COLORS_CYAN = ['#ecfeff', '#67e8f9', '#06b6d4', '#0891b2', '#0e7490', '#164e63']
export const QUINTIL_COLORS_ROSE = ['#fff1f2', '#fda4af', '#f43f5e', '#e11d48', '#be123c', '#881337']
export const QUINTIL_COLORS_PINK = ['#fdf2f8', '#f9a8d4', '#ec4899', '#db2777', '#be185d', '#831843']
export const QUINTIL_COLORS_YELLOW = ['#fefce8', '#fde047', '#eab308', '#ca8a04', '#a16207', '#713f12']
export const QUINTIL_COLORS_LIME = ['#f7fee7', '#bef264', '#84cc16', '#65a30d', '#4d7c0f', '#365314']
export const QUINTIL_COLORS_FUCHSIA = ['#fdf4ff', '#e879f9', '#d946ef', '#c026d3', '#a21caf', '#701a75']
export const QUINTIL_COLORS_SLATE = ['#f8fafc', '#cbd5e1', '#94a3b8', '#64748b', '#475569', '#1e293b']
export const QUINTIL_COLORS_BROWN = ['#fef3e2', '#d4a574', '#b87333', '#8b5e3c', '#6b3a1f', '#3d2010']
export const QUINTIL_COLORS_INDIGO = ['#eef2ff', '#a5b4fc', '#6366f1', '#4f46e5', '#4338ca', '#312e81']
export const QUINTIL_COLORS_SKY = ['#f0f9ff', '#7dd3fc', '#0ea5e9', '#0284c7', '#0369a1', '#0c4a6e']
export const QUINTIL_COLORS_SEISMIC = ['#2166ac', '#4393c3', '#92c5de', '#f7f7f7', '#f4a582', '#d6604d', '#b2182b']
export const QUINTIL_COLORS_COOL_WARM = ['#3b4cc0', '#6b8cff', '#aab4ff', '#f7f7f7', '#ff9e9e', '#f46b6b', '#b40426']

// All named palettes for the selector
export const CHOROPLETH_PALETTES: { id: string; label: string; colors: string[] }[] = [
  { id: 'blue', label: 'Azul', colors: QUINTIL_COLORS_BLUE },
  { id: 'orange', label: 'Laranja', colors: QUINTIL_COLORS_ORANGE },
  { id: 'green', label: 'Verde', colors: QUINTIL_COLORS_GREEN },
  { id: 'purple', label: 'Roxo', colors: QUINTIL_COLORS_PURPLE },
  { id: 'red', label: 'Vermelho', colors: QUINTIL_COLORS_RED },
  { id: 'teal', label: 'Teal', colors: QUINTIL_COLORS_TEAL },
  { id: 'amber', label: 'Âmbar', colors: QUINTIL_COLORS_AMBER },
  { id: 'emerald', label: 'Esmeralda', colors: QUINTIL_COLORS_EMERALD },
  { id: 'cyan', label: 'Ciano', colors: QUINTIL_COLORS_CYAN },
  { id: 'rose', label: 'Rosa', colors: QUINTIL_COLORS_ROSE },
  { id: 'pink', label: 'Pink', colors: QUINTIL_COLORS_PINK },
  { id: 'yellow', label: 'Amarelo', colors: QUINTIL_COLORS_YELLOW },
  { id: 'lime', label: 'Lima', colors: QUINTIL_COLORS_LIME },
  { id: 'fuchsia', label: 'Fúcsia', colors: QUINTIL_COLORS_FUCHSIA },
  { id: 'slate', label: 'Ardósia', colors: QUINTIL_COLORS_SLATE },
  { id: 'brown', label: 'Marrom', colors: QUINTIL_COLORS_BROWN },
  { id: 'indigo', label: 'Índigo', colors: QUINTIL_COLORS_INDIGO },
  { id: 'sky', label: 'Céu', colors: QUINTIL_COLORS_SKY },
  { id: 'seismic', label: 'Sísmico', colors: QUINTIL_COLORS_SEISMIC },
  { id: 'coolwarm', label: 'Frio-Quente', colors: QUINTIL_COLORS_COOL_WARM },
]

export function getPaletteColors(paletteId: string, customStart?: string, customEnd?: string): string[] {
  const named = CHOROPLETH_PALETTES.find(p => p.id === paletteId)
  if (named) return named.colors
  if (paletteId === 'custom' && customStart && customEnd) {
    return interpolateColors(customStart, customEnd, 6)
  }
  return QUINTIL_COLORS_BLUE
}

function interpolateColors(start: string, end: string, steps: number): string[] {
  const parseHex = (hex: string): [number, number, number] => {
    const h = hex.replace('#', '')
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  }
  const toHex = (r: number, g: number, b: number) =>
    '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
  const [r1, g1, b1] = parseHex(start)
  const [r2, g2, b2] = parseHex(end)
  return Array.from({ length: steps }, (_, i) => {
    const t = i / (steps - 1)
    return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t)
  })
}

export interface QuintileScale {
  colorFn: (value: number) => string
  labels: string[]
  thresholds: number[]
  legendColors: string[]
}

/**
 * Build an N-class quantile color scale from an array of numeric values.
 * Colors are picked evenly from the palette; thresholds are equal-count quantiles.
 */
export function makeQuintilScale(
  values: number[],
  palette: string[] = QUINTIL_COLORS_BLUE,
  unit = '',
  classes = 5
): QuintileScale {
  const valid = values.filter((v) => v !== null && v !== undefined && !Number.isNaN(v))
  if (!valid.length) {
    return { colorFn: () => '#2d3742', labels: [], thresholds: [], legendColors: [] }
  }

  const sorted = [...valid].sort((a, b) => a - b)
  const n = Math.max(2, Math.min(classes, 10))

  // Pick n colors evenly spaced across the palette
  const legendColors = Array.from({ length: n }, (_, i) => {
    const idx = Math.round(i * (palette.length - 1) / (n - 1))
    return palette[Math.min(idx, palette.length - 1)]
  })

  // n-1 quantile breakpoints (equal count)
  const quantile = (p: number) =>
    sorted[Math.min(Math.floor((sorted.length - 1) * p), sorted.length - 1)]
  const thresholds = Array.from({ length: n - 1 }, (_, i) => quantile((i + 1) / n))

  function colorFn(value: number): string {
    if (value === null || value === undefined || Number.isNaN(value) || value === 0) return '#2d3742'
    for (let i = 0; i < thresholds.length; i++) {
      if (value <= thresholds[i]) return legendColors[i]
    }
    return legendColors[n - 1]
  }

  const fmt = (v: number) =>
    v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M${unit}`
    : v >= 1_000 ? `${(v / 1_000).toFixed(1)}k${unit}`
    : `${v.toFixed(1)}${unit}`

  const labels = legendColors.map((_, i) => {
    if (i === 0) return `≤ ${fmt(thresholds[0])}`
    if (i === n - 1) return `> ${fmt(thresholds[n - 2])}`
    return `${fmt(thresholds[i - 1])} – ${fmt(thresholds[i])}`
  })

  return { colorFn, labels, thresholds, legendColors }
}

/** Calculate centroid of a Polygon or MultiPolygon feature (returns [lon, lat]). */
export function calcCentroid(feature: GeoJSON.Feature): [number, number] {
  const geom = feature.geometry
  let coords: number[][] = []

  if (geom.type === 'Polygon') {
    coords = geom.coordinates[0] as number[][]
  } else if (geom.type === 'MultiPolygon') {
    // pick the largest ring by point count
    let best: number[][] = []
    let bestLen = 0
    ;(geom.coordinates as number[][][][]).forEach((poly) => {
      poly.forEach((ring) => {
        if (ring.length > bestLen) {
          bestLen = ring.length
          best = ring as number[][]
        }
      })
    })
    coords = best
  }

  if (!coords.length) return [0, 0]

  let area = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < coords.length - 1; i++) {
    const [x0, y0] = coords[i]
    const [x1, y1] = coords[i + 1]
    const a = x0 * y1 - x1 * y0
    area += a
    cx += (x0 + x1) * a
    cy += (y0 + y1) * a
  }
  area *= 0.5
  const factor = area === 0 ? 0 : 1 / (6 * area)
  return [cx * factor, cy * factor]
}

/** Transmission-line color by voltage (kV). */
export function ltColor(tensao?: string | number): string {
  if (!tensao) return '#9ca3af'
  const kv = typeof tensao === 'string' ? parseInt(tensao, 10) : tensao
  if (kv >= 765) return '#7c3aed'
  if (kv >= 500) return '#dc2626'
  if (kv >= 345) return '#ea580c'
  if (kv >= 230) return '#ca8a04'
  if (kv >= 138) return '#16a34a'
  return '#9ca3af'
}

export function joinChoropleth(
  rows: ChoroplethRow[],
  idCol: string,
  valueCol: string,
  nameMap: Record<string, string>
): Record<string, number> {
  const result: Record<string, number> = {}

  const normalize = (s: string) =>
    String(s).toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '')

  // Build reverse maps: normalized name → ALL feature IDs that map to that name
  // and also index by sigla and code
  const normToIds: Record<string, string[]> = {}
  const siglaToIds: Record<string, string[]> = {}
  const codeToIds: Record<string, string[]> = {}
  // nameMap can have multiple keys mapping to the same name.
  // We group: for each name, collect ALL feature IDs (the canonical ones used in map expressions)
  for (const [key, name] of Object.entries(nameMap)) {
    const norm = normalize(name)
    if (!normToIds[norm]) normToIds[norm] = []
    normToIds[norm].push(key)
    // 2-letter keys are siglas
    if (/^[A-Z]{2}$/.test(key)) {
      if (!siglaToIds[key]) siglaToIds[key] = []
      siglaToIds[key].push(key)
    }
    // Numeric keys are codes
    if (/^\d+$/.test(key)) {
      if (!codeToIds[key]) codeToIds[key] = []
      codeToIds[key].push(key)
    }
  }

  // Well-known UF sigla → IBGE code map (the codigo_ibg values from IBGE GeoJSON)
  const UF_TO_CODE: Record<string, string> = {
    'RO': '11', 'AC': '12', 'AM': '13', 'RR': '14', 'PA': '15',
    'AP': '16', 'TO': '17', 'MA': '21', 'PI': '22', 'CE': '23',
    'RN': '24', 'PB': '25', 'PE': '26', 'AL': '27', 'SE': '28',
    'BA': '29', 'MG': '31', 'ES': '32', 'RJ': '33', 'SP': '35',
    'PR': '41', 'SC': '42', 'RS': '43', 'MS': '50', 'MT': '51',
    'GO': '52', 'DF': '53',
  }

  // For each data row, find the matching feature ID(s) in the nameMap
  // and store the value under ALL matching feature IDs (so the map expression finds it)
  for (const row of rows) {
    const rawId = String(row[idCol] ?? '')
    const val = Number(row[valueCol])
    if (!rawId || isNaN(val)) continue

    // Collect all feature IDs that this row's key matches
    const matchedIds = new Set<string>()

    // 1) Direct key match — rawId is exactly a key in nameMap
    if (nameMap[rawId] !== undefined) {
      matchedIds.add(rawId)
    }

    // 2) Normalized name match
    const normKey = normalize(rawId)
    const ids = normToIds[normKey]
    if (ids) {
      ids.forEach(id => matchedIds.add(id))
    }

    // 3) UF sigla match — "SP" → code "35" → find in nameMap
    const upper = rawId.toUpperCase().trim()
    const code = UF_TO_CODE[upper]
    if (code) {
      const codeIds = codeToIds[code]
      if (codeIds) codeIds.forEach(id => matchedIds.add(id))
      if (nameMap[code] !== undefined) matchedIds.add(code)
    }
    // Also try direct sigla match
    if (siglaToIds[upper]) {
      siglaToIds[upper].forEach(id => matchedIds.add(id))
    }

    // 4) Numeric code with leading-zero stripping
    const stripped = rawId.replace(/^0+/, '') || rawId
    const sIds = codeToIds[stripped]
    if (sIds) sIds.forEach(id => matchedIds.add(id))
    if (nameMap[stripped] !== undefined) matchedIds.add(stripped)

    // Store value under all matched feature IDs
    for (const id of matchedIds) {
      result[id] = val
    }
  }

  return result
}

/** Power-plant type color mapping. */
export const TIPO_USINA_CORES: Record<string, string> = {
  UHE: '#1e40af',
  PCH: '#3b82f6',
  CGH: '#93c5fd',
  EOL: '#16a34a',
  UFV: '#ca8a04',
  UTE: '#78716c',
  UTN: '#dc2626',
}
