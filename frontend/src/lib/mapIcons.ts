export interface IconDefinition {
  name: string
  label: string
  category: string
  svg: string
}

/* Helper to build a consistent SVG wrapper with viewBox and currentColor fill */
function svg(path: string, viewBox = '0 0 24 24'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="currentColor" width="100%" height="100%">${path}</svg>`
}

const INDUSTRY_PATH = `
  <path d="M2 22h20V10l-6 4V10l-6 4V8L4 12v10z"/>
  <path d="M6 8V2h4v4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
`

const FACTORY_PATH = `
  <path d="M4 22h16V12l-4 2v-2l-4 2v-2l-4 2v8z"/>
  <path d="M8 12V6h2v6M14 12V6h2v6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <rect x="6" y="2" width="4" height="4" rx="1"/>
  <rect x="12" y="2" width="4" height="4" rx="1"/>
`

const ENERGY_BOLT_PATH = `
  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
`

const POWER_TOWER_PATH = `
  <path d="M6 22h12"/>
  <path d="M6 22l3-20h6l3 20"/>
  <path d="M9 14h6M8 10h8M7 6h10" fill="none" stroke="currentColor" stroke-width="1.5"/>
`

const SOLAR_PANEL_PATH = `
  <rect x="3" y="14" width="18" height="6" rx="1"/>
  <path d="M6 14V8h12v6" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <path d="M8 22h8M12 20v2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M5 11h14M6 8h12" fill="none" stroke="currentColor" stroke-width="1"/>
`

const WIND_TURBINE_PATH = `
  <path d="M12 22V10"/>
  <path d="M12 10L6 4M12 10l6-4M12 10V2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <circle cx="12" cy="10" r="1.5"/>
`

const TRUCK_PATH = `
  <rect x="2" y="8" width="13" height="8" rx="1"/>
  <rect x="15" y="10" width="7" height="6" rx="1"/>
  <circle cx="6" cy="18" r="2"/>
  <circle cx="19" cy="18" r="2"/>
  <path d="M2 12h13" fill="none" stroke="currentColor" stroke-width="1"/>
`

const SHIP_PATH = `
  <path d="M3 16l3-10h12l3 10"/>
  <path d="M2 18l2 4h16l2-4"/>
  <path d="M8 6V3h8v3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M6 10h12" fill="none" stroke="currentColor" stroke-width="1"/>
`

const PLANE_PATH = `
  <path d="M2 12h6l4-7 2 7h8l-3 3h-5l-2 5-2-5H5z"/>
`

const TRAIN_PATH = `
  <rect x="4" y="6" width="16" height="10" rx="2"/>
  <path d="M8 22l-2-6M16 22l2-6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
  <circle cx="9" cy="18" r="1.5"/>
  <circle cx="15" cy="18" r="1.5"/>
  <path d="M6 10h12M6 13h12" fill="none" stroke="currentColor" stroke-width="1"/>
`

const HEALTH_PATH = `
  <path d="M12 2l4 4h3v3l4 4-4 4v3h-3l-4 4-4-4H5v-3l-4-4 4-4V6h3z"/>
`

const GRADUATION_PATH = `
  <path d="M12 3L1 9l4 2v6l7 4 7-4v-6l4-2L12 3z"/>
  <path d="M12 13v6" fill="none" stroke="currentColor" stroke-width="1.5"/>
`

const STORE_PATH = `
  <path d="M3 6l2-3h14l2 3v4H3V6z"/>
  <path d="M3 10v10a1 1 0 001 1h16a1 1 0 001-1V10"/>
  <path d="M8 22V14h8v8" fill="none" stroke="currentColor" stroke-width="1.5"/>
`

const TRACTOR_PATH = `
  <circle cx="6" cy="18" r="3"/>
  <circle cx="18" cy="18" r="3"/>
  <path d="M6 15V8h8l3 4v3"/>
  <path d="M14 8V4h3v4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
`

const PLANT_PATH = `
  <path d="M12 22V10"/>
  <path d="M12 10C8 6 4 8 4 4c4 0 6 4 8 6z"/>
  <path d="M12 10c4-6 8-4 8-8-4 0-6 4-8 6z"/>
`

const OIL_RIG_PATH = `
  <path d="M8 22h8"/>
  <path d="M10 22V12l4-6 4 6v10"/>
  <path d="M6 22V14l4-2" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <path d="M12 6V2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <circle cx="12" cy="2" r="1"/>
`

const MINING_PICK_PATH = `
  <path d="M2 20l8-8"/>
  <path d="M10 12l4-4"/>
  <path d="M14 8l6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M18 4l4 2-2 4-4-2z"/>
`

const TOWER_PATH = `
  <path d="M12 2v20"/>
  <path d="M6 6l6 4 6-4" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <path d="M4 10l8 5 8-5" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <circle cx="12" cy="2" r="1.5"/>
`

const WATER_DROP_PATH = `
  <path d="M12 2C8 6 4 10 4 14a8 8 0 0016 0c0-4-4-8-8-12z"/>
`

const RECYCLE_PATH = `
  <path d="M7 19l-3-5h4"/>
  <path d="M17 19l3-5h-4"/>
  <path d="M12 4l3 5H9z"/>
  <path d="M7 19a7 7 0 0110 0M17 19a7 7 0 00-10 0M12 4a7 7 0 000 0" fill="none" stroke="currentColor" stroke-width="1.5"/>
`

const PIN_PATH = `
  <path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z"/>
  <circle cx="12" cy="9" r="2.5" fill="none" stroke="currentColor" stroke-width="1.5"/>
`

const CIRCLE_PATH = `
  <circle cx="12" cy="12" r="8"/>
`

const SQUARE_PATH = `
  <rect x="4" y="4" width="16" height="16" rx="2"/>
`

const DIAMOND_PATH = `
  <path d="M12 2l10 10-10 10L2 12z"/>
`

// ── Custom icons (loaded from backend, merged with built-ins) ──
let CUSTOM_ICONS: IconDefinition[] = []

export function setCustomIcons(icons: IconDefinition[]) {
  CUSTOM_ICONS = icons
}

export function getAllIcons(): IconDefinition[] {
  return [...BUILT_IN_ICONS, ...CUSTOM_ICONS]
}

export const BUILT_IN_ICONS: IconDefinition[] = [
  { name: 'circle', label: 'Círculo', category: 'Básicos', svg: svg(CIRCLE_PATH) },
  { name: 'square', label: 'Quadrado', category: 'Básicos', svg: svg(SQUARE_PATH) },
  { name: 'diamond', label: 'Losango', category: 'Básicos', svg: svg(DIAMOND_PATH) },
  { name: 'pin', label: 'Alfinete', category: 'Básicos', svg: svg(PIN_PATH) },
  { name: 'industry', label: 'Indústria', category: 'Indústria & Energia', svg: svg(INDUSTRY_PATH) },
  { name: 'factory', label: 'Fábrica', category: 'Indústria & Energia', svg: svg(FACTORY_PATH) },
  { name: 'energy', label: 'Energia', category: 'Indústria & Energia', svg: svg(ENERGY_BOLT_PATH) },
  { name: 'power-tower', label: 'Torre de energia', category: 'Indústria & Energia', svg: svg(POWER_TOWER_PATH) },
  { name: 'solar', label: 'Energia solar', category: 'Indústria & Energia', svg: svg(SOLAR_PANEL_PATH) },
  { name: 'wind', label: 'Eólica', category: 'Indústria & Energia', svg: svg(WIND_TURBINE_PATH) },
  { name: 'truck', label: 'Caminhão', category: 'Transporte', svg: svg(TRUCK_PATH) },
  { name: 'ship', label: 'Navio', category: 'Transporte', svg: svg(SHIP_PATH) },
  { name: 'plane', label: 'Avião', category: 'Transporte', svg: svg(PLANE_PATH) },
  { name: 'train', label: 'Trem', category: 'Transporte', svg: svg(TRAIN_PATH) },
  { name: 'health', label: 'Saúde', category: 'Serviços', svg: svg(HEALTH_PATH) },
  { name: 'education', label: 'Educação', category: 'Serviços', svg: svg(GRADUATION_PATH) },
  { name: 'store', label: 'Comércio', category: 'Serviços', svg: svg(STORE_PATH) },
  { name: 'tractor', label: 'Trator', category: 'Agricultura', svg: svg(TRACTOR_PATH) },
  { name: 'plant', label: 'Agricultura', category: 'Agricultura', svg: svg(PLANT_PATH) },
  { name: 'oil', label: 'Petróleo & Gás', category: 'Recursos', svg: svg(OIL_RIG_PATH) },
  { name: 'mining', label: 'Mineração', category: 'Recursos', svg: svg(MINING_PICK_PATH) },
  { name: 'telecom', label: 'Telecomunicações', category: 'Infraestrutura', svg: svg(TOWER_PATH) },
  { name: 'water', label: 'Água & Saneamento', category: 'Infraestrutura', svg: svg(WATER_DROP_PATH) },
  { name: 'recycle', label: 'Reciclagem', category: 'Infraestrutura', svg: svg(RECYCLE_PATH) },
]

export function getIconByName(name: string): IconDefinition | undefined {
  return getAllIcons().find((i) => i.name === name)
}

export function getIconsByCategory(): Record<string, IconDefinition[]> {
  const groups: Record<string, IconDefinition[]> = {}
  for (const icon of getAllIcons()) {
    if (!groups[icon.category]) groups[icon.category] = []
    groups[icon.category].push(icon)
  }
  return groups
}

/**
 * Apply a color tint to an SVG string.
 * Replaces currentColor and common black fills/strokes with the target color.
 * Also handles inline styles and ensures the root svg inherits the color.
 */
export function tintSvg(svg: string, color: string): string {
  if (!svg) return svg
  let tinted = svg

  // 1. Replace currentColor (both attribute and inline style)
  tinted = tinted.replace(/fill="currentColor"/g, `fill="${color}"`)
  tinted = tinted.replace(/stroke="currentColor"/g, `stroke="${color}"`)
  tinted = tinted.replace(/fill:\s*currentColor/g, `fill:${color}`)
  tinted = tinted.replace(/stroke:\s*currentColor/g, `stroke:${color}`)

  // 2. Replace explicit black fills
  tinted = tinted.replace(/fill="black"/g, `fill="${color}"`)
  tinted = tinted.replace(/fill="#000000"/g, `fill="${color}"`)
  tinted = tinted.replace(/fill="#000"/g, `fill="${color}"`)
  tinted = tinted.replace(/fill="rgb\(0,\s*0,\s*0\)"/g, `fill="${color}"`)
  tinted = tinted.replace(/fill:\s*black/g, `fill:${color}`)
  tinted = tinted.replace(/fill:\s*#000000/g, `fill:${color}`)
  tinted = tinted.replace(/fill:\s*#000/g, `fill:${color}`)

  // 3. Replace explicit black strokes
  tinted = tinted.replace(/stroke="black"/g, `stroke="${color}"`)
  tinted = tinted.replace(/stroke="#000000"/g, `stroke="${color}"`)
  tinted = tinted.replace(/stroke="#000"/g, `stroke="${color}"`)
  tinted = tinted.replace(/stroke="rgb\(0,\s*0,\s*0\)"/g, `stroke="${color}"`)
  tinted = tinted.replace(/stroke:\s*black/g, `stroke:${color}`)
  tinted = tinted.replace(/stroke:\s*#000000/g, `stroke:${color}`)
  tinted = tinted.replace(/stroke:\s*#000/g, `stroke:${color}`)

  // 4. Ensure root <svg> has a fill so children can inherit
  if (!tinted.match(/<svg[^>]*\sfill="/)) {
    tinted = tinted.replace(/<svg/, `<svg fill="${color}"`)
  }

  return tinted
}

/**
 * Extracts an SVG string from a React component snippet (e.g. from icons0.dev).
 * Handles spread props, JSX expressions, and normalizes attributes.
 */
export function extractSvgFromReactComponent(code: string): string | null {
  // Find the <svg ...>...</svg> block
  const svgMatch = code.match(/<svg\b[\s\S]*?<\/svg>/)
  if (!svgMatch) return null

  let svg = svgMatch[0]

  // Ensure xmlns is present
  if (!svg.includes('xmlns=')) {
    svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"')
  }

  // Remove {...props} spread
  svg = svg.replace(/\{\s*\.\.\.\s*props\s*\}/g, '')
  // Remove individual prop spreads like width={...} when they are expressions
  svg = svg.replace(/\swidth=\{\s*props\.width\s*\}/g, '')
  svg = svg.replace(/\sheight=\{\s*props\.height\s*\}/g, '')

  // Normalize width/height to 100% so it scales in the marker container
  svg = svg.replace(/\swidth="[^"]*"/g, ' width="100%"')
  svg = svg.replace(/\sheight="[^"]*"/g, ' height="100%"')
  svg = svg.replace(/\swidth=\{[^}]*\}/g, ' width="100%"')
  svg = svg.replace(/\sheight=\{[^}]*\}/g, ' height="100%"')

  // Clean up double spaces
  svg = svg.replace(/\s{2,}/g, ' ')

  return svg
}

export function buildMarkerHtml(svgContent: string, color: string, size: number): string {
  return `
    <div style="
      width:${size}px;
      height:${size}px;
      color:${color};
      display:flex;
      align-items:center;
      justify-content:center;
      filter:drop-shadow(0 1px 2px rgba(0,0,0,0.35));
      transform:translate(-50%,-50%);
      pointer-events:none;
    ">
      ${svgContent}
    </div>
  `
}
