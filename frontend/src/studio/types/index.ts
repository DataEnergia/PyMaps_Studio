export type BlockType =
  | 'map'
  | 'card'
  | 'chart'
  | 'text'
  | 'table'
  | 'image'
  | 'shape'
  | 'timeline'
  | 'minimap'
  | 'connector'
  | 'divider'

export type ChartType = 'bar' | 'line' | 'pie' | 'scatter' | 'donut' | 'area' | 'radial' | 'stacked' | 'composed' | 'treemap' | 'funnel' | 'radar' | 'grouped'

export interface Bounds {
  x: number
  y: number
  w: number
  h: number
}

export interface MapMarker {
  lat: number
  lon: number
  label?: string
  color?: string
  size?: number
  icon?: string
}

export interface AreaSpec {
  type: 'brasil' | 'region' | 'uf' | 'municipio' | string
  id?: number | null
  nome?: string
  /** Hierarchy fields for accurate parent resolution. */
  regionId?: number | null
  ufId?: number | null
  municipioId?: number | null
}

export interface ChoroplethRow {
  [key: string]: string | number
}

export interface GeoJsonLayer {
  id: string
  name: string
  geojson: unknown
  geometryType: 'Point' | 'LineString' | 'Polygon' | 'Mixed'
  featureCount: number
  visible: boolean
  color: string
  opacity: number
  strokeWidth?: number
  pointSize?: number
  labelProp?: string
  showLegend: boolean
  /** Icon name (built-in) or raw SVG string for point layers. */
  icon?: string
  /** Icon color override. */
  iconColor?: string
}

export interface PointLayer {
  id: string
  name: string
  /** Filtered points rendered on the map. */
  points: Array<{ lat: number; lon: number }>
  pointCount: number
  visible: boolean
  color: string
  size?: number
  opacity?: number
  strokeWidth?: number
  strokeColor?: string
  icon?: string
  iconColor?: string
  style?: 'circle' | 'naked' | 'pin'
  showLegend: boolean
  /** When true, points are filtered to only those inside the map's area geometry. */
  filterByArea?: boolean
  /** Raw unfiltered points — kept so we can re-filter when the area changes. */
  rawPoints?: Array<{ lat: number; lon: number }>
}

/* ── Map block: holds its own independent state per instance ── */
export type BaseMapKind = 'none' | 'road' | 'terrain' | 'satellite' | 'dark'

export interface MapBlockConfig {
  /** Friendly name shown in the sidebar list (e.g. "Mapa 1", "Brasil"). */
  name?: string

  /** Area definition (region/uf/municipio). */
  area?: AreaSpec

  /** Persisted GeoJSON for offline-first behavior. */
  geojson?: unknown | null
  /** Cached area display name for sidebar. */
  areaName?: string

  /** Visual style. */
  basemap?: BaseMapKind
  fillColor?: string
  borderColor?: string
  borderWidth?: number
  fillOpacity?: number

  /** Markers / points. */
  markers?: MapMarker[]
  /** Original unfiltered points (before geo intersection). Used to re-filter when area changes. */
  rawPoints?: { lat: number; lon: number }[]
  markerColor?: string
  markerSize?: number
  markerStrokeWidth?: number
  markerStrokeColor?: string
  /** Icon name (built-in) or raw SVG string for markers. */
  markerIcon?: string
  /** Icon color override. */
  markerIconColor?: string
  /** Visual style for icon markers: 'circle' = icon on circle bg (default), 'naked' = icon only, 'pin' = teardrop pin. */
  markerStyle?: 'circle' | 'naked' | 'pin'

  /** Per-feature override colors (id → hex). */
  featureColors?: Record<string, string>

  /** Centroid labels (siglas dos estados). */
  showStateLabels?: boolean
  stateLabelColor?: string
  stateLabelSize?: number
  /** Manual position overrides: featureId → fraction of block size (0..1). */
  stateLabelPositions?: Record<string, { x: number; y: number }>

  /** Border visibility controls */
  showInternalBorders?: boolean  // default: true
  showOuterBorder?: boolean      // default: false
  outerBorderColor?: string      // default: '#ffffff'
  outerBorderWidth?: number      // default: 2

  /** Camera. */
  zoom?: number
  center?: [number, number]

  // Choropleth layer
  choroplethMode?: boolean
  /** GeoJSON for choropleth layer — separate from area geojson so AreaTab changes don't overwrite it. */
  choroplethGeojson?: unknown | null
  choroplethData?: ChoroplethRow[]
  choroplethIdCol?: string
  choroplethValueCol?: string
  /** Detected geographic level of choropleth data — used to filter features when area changes. */
  choroplethGeoLevel?: 'municipio' | 'uf' | 'region'
  choroplethPalette?: string
  choroplethCustomStart?: string
  choroplethCustomEnd?: string
  choroplethClasses?: 3 | 5 | 7
  choroplethUnit?: string
  choroplethTitle?: string
  choroplethLayerVisible?: boolean  // default: true
  /** Custom GeoJSON overlay layers. */
  geoJsonLayers?: GeoJsonLayer[]

  // Points layer
  pointsLayerVisible?: boolean      // default: true
  /** Custom point layers (multiple). */
  pointLayers?: PointLayer[]

  // Unified map legend (covers choropleth + points)
  showLegend?: boolean              // master toggle, default true
  legendX?: number                  // fraction of block width  (0..1)
  legendY?: number                  // fraction of block height (0..1)
  legendScale?: number              // size multiplier, default 1.0
  legendBg?: string                 // CSS color or 'transparent' (default)
  showChoroplethLegend?: boolean    // show choropleth section, default true
  choroplethLegendTitle?: string    // title above choropleth swatches
  showPointsLegend?: boolean        // show points section, default true
  pointsLegendLabel?: string        // label for the points row
}

/* ── Card templates ── */
export type CardTemplate =
  | 'stat'        // KPI clássico (rótulo + valor + delta)
  | 'trend'       // valor + sparkline implícito + delta % colorido
  | 'quote'       // citação editorial com aspas e atribuição
  | 'highlight'   // bloco de destaque com background colorido
  | 'numbered'    // grande numeral à esquerda
  | 'badge'       // tag pequena em cima + valor + suporte
  | 'comparison'  // dois valores lado a lado com vs.
  | 'progress'    // KPI com barra de progresso
  | 'icon'        // KPI com ícone à esquerda em círculo
  | 'minimal'     // ultra-clean: só rótulo fino + valor enorme
  | 'gradient'    // gradiente diagonal como fundo
  | 'split'       // metade rótulo / metade valor
  | 'pill'        // compacto, arredondado, estilo tag

export type CardFontFamily = 'sans' | 'condensed' | 'serif' | 'mono'

export interface CardBlockConfig {
  template?: CardTemplate
  title?: string
  value?: string
  subtitle?: string
  icon?: string
  iconPosition?: 'left' | 'right' | 'top'
  /** Para template 'comparison'. */
  valueB?: string
  labelA?: string
  labelB?: string
  /** Para 'quote'. */
  author?: string
  /** Para 'badge'. */
  badge?: string
  /** Para 'progress' — 0..100. */
  progressValue?: number
  progressMax?: number
  /** Trend delta (ex.: "+12%") + sinal. */
  delta?: string
  trend?: 'up' | 'down' | 'flat'
  /** Estilo. */
  color?: string
  /** Cor secundária para gradient/progress. */
  colorSecondary?: string
  backgroundColor?: string
  textColor?: string
  /** Tipografia. */
  fontFamily?: CardFontFamily
  titleSize?: number
  valueSize?: number
  subtitleSize?: number
  titleWeight?: number
  valueWeight?: number
  italicTitle?: boolean
  italicValue?: boolean
  /** Layout. */
  align?: 'left' | 'center' | 'right'
  padding?: number
  showAccentBar?: boolean
  accentBarPosition?: 'left' | 'top' | 'bottom' | 'right'
  accentBarWidth?: number
  rounded?: number
  shadow?: boolean
  border?: boolean
  borderColor?: string
}

export interface ChartData {
  labels: string[]
  values: number[]
  datasetLabel?: string
  values2?: number[]
  dataset2Label?: string
  /** Additional series for radar/stacked (3rd+ series). */
  series?: ChartSeries[]
}

export interface ChartSeries {
  name: string
  values: number[]
}

export type ChartCategory = 'comparison' | 'trend' | 'composition' | 'distribution'

export const CHART_TYPE_META: Record<ChartType, { label: string; desc: string; category: ChartCategory; horizontal?: boolean }> = {
  bar:       { label: 'Barras',         desc: 'Comparação de categorias',          category: 'comparison' },
  line:      { label: 'Linha',          desc: 'Séries temporais',                   category: 'trend' },
  area:      { label: 'Área',           desc: 'Tendências com volume',              category: 'trend' },
  pie:       { label: 'Pizza',          desc: 'Proporções do total',                category: 'composition' },
  donut:     { label: 'Rosca',          desc: 'Proporções + centro livre',          category: 'composition' },
  radial:    { label: 'Radial',         desc: 'Anéis concêntricos',                 category: 'composition' },
  stacked:   { label: 'Empilhado',      desc: 'Barras com séries empilhadas',       category: 'comparison' },
  composed:  { label: 'Misto',          desc: 'Barras + linha de tendência',        category: 'comparison' },
  scatter:   { label: 'Dispersão',      desc: 'Pontos no plano',                    category: 'distribution' },
  treemap:   { label: 'Treemap',        desc: 'Hierarquia como retângulos',         category: 'composition' },
  funnel:    { label: 'Funil',          desc: 'Etapas de conversão',                category: 'distribution' },
  radar:     { label: 'Radar',          desc: 'Múltiplas variáveis em eixos',      category: 'comparison' },
  grouped:   { label: 'Agrupado',       desc: 'Barras múltiplas por categoria',     category: 'comparison' },
}

export type LegendPosition = 'top' | 'right' | 'bottom' | 'left'

export interface ChartBlockConfig {
  chartType: ChartType
  title?: string
  subtitle?: string
  source?: string
  data: ChartData
  colors?: string[]
  showLegend?: boolean
  legendPosition?: LegendPosition
  showValues?: boolean
  showGrid?: boolean
  horizontal?: boolean
  backgroundColor?: string
  textColor?: string
  strokeWidth?: number
  curved?: boolean
  rounded?: boolean
  innerRadius?: number
  barSize?: number
  centerLabel?: string
  centerSubLabel?: string
  valuePrefix?: string
  valueSuffix?: string
  valueDecimals?: number
  referenceValue?: number
  referenceLabel?: string
  /** Radar: max value for axes. */
  radarMax?: number
  /** Funnel: label position. */
  funnelLabelPosition?: 'inside' | 'right' | 'left'
  /** Single color for all bars (default: #7a8a9a). */
  barColor?: string
  /** Color for second series in grouped chart. */
  series2Color?: string
  /** Enable dual Y-axes for grouped chart. */
  dualAxis?: boolean
  /** Padding for Y-axis labels (default: 8). */
  axisPadding?: number
  /** X-axis label rotation angle (default: 0, use -90 for vertical). */
  xLabelAngle?: number
  /** Sort order for chart data. */
  sortMode?: 'none' | 'valueAsc' | 'valueDesc' | 'labelAsc' | 'labelDesc'
  /** Font size for chart labels. */
  fontSize?: number
}

export type TextBackgroundStyle =
  | 'none'
  | 'card'
  | 'glass'
  | 'paper'
  | 'strip'
  | 'highlight'

export type TextPreset =
  | 'custom'
  | 'headline'
  | 'subhead'
  | 'body'
  | 'caption'
  | 'quote'
  | 'kicker'
  | 'callout'
  | 'label'

export type FontFamilyKey = 'sans' | 'condensed' | 'serif' | 'mono'

export interface TextBlockConfig {
  content: string
  fontFamily?: FontFamilyKey
  fontSize?: number
  fontWeight?: number
  lineHeight?: number
  letterSpacing?: number
  alignment?: 'left' | 'center' | 'right'
  bodyColor?: string
  backgroundColor?: string
  backgroundStyle?: TextBackgroundStyle
  preset?: TextPreset
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  textTransform?: 'none' | 'uppercase' | 'capitalize' | 'lowercase'
  /** Vertical alignment inside the box. */
  verticalAlign?: 'top' | 'middle' | 'bottom'
  /** Box padding (px). */
  padding?: number
}

export interface TableColumn {
  key: string
  label: string
  align?: 'left' | 'center' | 'right'
  format?: 'text' | 'number' | 'currency' | 'percent' | 'date'
  width?: number
}

export type TableTemplate =
  | 'editorial'   // header com underline, sem zebra, tipografia condensed
  | 'minimal'     // ultra clean, divisores muito leves
  | 'striped'     // linhas alternadas suaves
  | 'card'        // cantos arredondados + sombra leve
  | 'comparison'  // primeira coluna em destaque (negrito)
  | 'ranking'     // numeração à esquerda (1, 2, 3...) + medalhas para top 3
  | 'heatmap'     // células coloridas por valor

export interface TableBlockConfig {
  template?: TableTemplate
  columns: TableColumn[]
  rows: Record<string, unknown>[]
  title?: string
  subtitle?: string
  source?: string
  showHeader?: boolean
  showRowNumbers?: boolean
  maxRows?: number
  /** Cor para a heatmap / accent. */
  accentColor?: string
  /** Coluna numérica usada para heatmap/ranking. */
  valueColumn?: string
  /** Tipografia. */
  headerFontSize?: number
  cellFontSize?: number
  headerColor?: string
  cellColor?: string
  borderColor?: string
}

export type ImageMaskShape =
  | 'none'
  | 'rounded'
  | 'circle'
  | 'squircle'
  | 'hexagon'
  | 'star'
  | 'blob'
  | 'rhombus'

export interface ImageBlockConfig {
  src: string
  alt?: string
  fit?: 'contain' | 'cover' | 'fill'
  borderRadius?: number
  mask?: ImageMaskShape
  /** Visual filters (CSS-compatible). */
  brightness?: number   // 0–200, default 100
  contrast?: number     // 0–200, default 100
  saturation?: number   // 0–200, default 100
  grayscale?: number    // 0–100, default 0
  blur?: number         // px
  /** Cosmetic frame. */
  borderColor?: string
  borderWidth?: number
  shadow?: boolean
  /** Caption below the image. */
  caption?: string
  captionColor?: string
}

export interface TimelineEvent {
  date: string
  title: string
  subtitle?: string
  value?: string
  color?: string
}

export interface TimelineBlockConfig {
  orientation?: 'horizontal' | 'vertical'
  events: TimelineEvent[]
  title?: string
  showValues?: boolean
}

export interface MinimapBlockConfig {
  area: AreaSpec
  highlightPosition?: [number, number]
  highlightLabel?: string
  label?: string
}

export interface ConnectorAnchor {
  blockId?: string
  anchor?: string
  /** Free position on the canvas (canvas-absolute coords). */
  x?: number
  y?: number
}

export type MarkerType =
  | 'none'
  | 'arrow'           // ▶ classic
  | 'arrowOpen'       // ▷ outline
  | 'arrowConcave'    // ▶ stylish concave (like Canva)
  | 'triangle'        // △ blunt
  | 'circle'
  | 'circleOpen'
  | 'square'
  | 'diamond'
  | 'bar'
  | 'dot'

export type ConnectorStyle = 'straight' | 'curved' | 'orthogonal' | 'sCurve' | 'arc'

export interface ConnectorBlockConfig {
  fromAnchor: ConnectorAnchor
  toAnchor: ConnectorAnchor
  style?: ConnectorStyle
  color?: string
  strokeWidth?: number
  opacity?: number
  dashed?: boolean
  dashPattern?: 'solid' | 'dashed' | 'dotted' | 'dashLong'
  /** Visual marker on each end (overrides legacy arrowEnd). */
  startMarker?: MarkerType
  endMarker?: MarkerType
  /** Marker scale relative to stroke (1.0 = native). */
  startMarkerSize?: number
  endMarkerSize?: number
  /** Legacy compat. */
  arrowEnd?: boolean
  /** Curvature factor 0..1. */
  curvature?: number
  /** S-curve perpendicular offset. */
  bow?: number
  /** Drop shadow under the line. */
  shadow?: boolean
  /** Floating label centered on the path. */
  label?: string
  labelColor?: string
  labelBackground?: string
  labelFontSize?: number
}

export interface DividerBlockConfig {
  orientation?: 'horizontal' | 'vertical'
  color?: string
  thickness?: number
  style?: 'solid' | 'dashed' | 'dotted'
  label?: string
}

export type ShapeType =
  | 'rectangle'
  | 'circle'
  | 'ellipse'
  | 'triangle'
  | 'diamond'
  | 'pentagon'
  | 'hexagon'
  | 'star'
  | 'heart'
  | 'cloud'
  | 'shield'
  | 'speech'
  | 'callout'
  | 'ribbon'
  | 'blob'
  | 'cross'
  | 'arrow-right'
  | 'arrow-up'
  | 'arrow-left'
  | 'arrow-down'
  | 'arrow-double'
  | 'line'

export interface ShapeBlockConfig {
  shape: ShapeType
  fillColor?: string
  strokeColor?: string
  strokeWidth?: number
  opacity?: number
  /** Corner radius (for rectangle). */
  rounded?: number
  /** Rotation in degrees. */
  rotation?: number
  shadow?: boolean
  /** Gradient overlay. */
  gradient?: boolean
  gradientTo?: string
  gradientAngle?: number
  /** For lines only — endpoints relative to bounds top-left. */
  lineX1?: number
  lineY1?: number
  lineX2?: number
  lineY2?: number
  /** Stroke style for lines. */
  lineStyle?: 'solid' | 'dashed' | 'dotted'
  /** Arrow heads on line endpoints. */
  lineStartArrow?: boolean
  lineEndArrow?: boolean
}

export type BlockConfig =
  | MapBlockConfig
  | CardBlockConfig
  | ChartBlockConfig
  | TextBlockConfig
  | TableBlockConfig
  | ImageBlockConfig
  | ShapeBlockConfig
  | TimelineBlockConfig
  | MinimapBlockConfig
  | ConnectorBlockConfig
  | DividerBlockConfig
  | Record<string, unknown>

export interface Block {
  id: string
  type: BlockType
  bounds: Bounds
  config: BlockConfig
  zIndex?: number
  locked?: boolean
}

export interface CanvasSpec {
  width: number
  height: number
  background: string
}

export interface PageSpec {
  id: string
  name: string
  canvas: CanvasSpec
  blocks: Block[]
  preview?: string
}

export interface InfographicSpec {
  canvas: CanvasSpec
  blocks: Block[]
  title?: string
  description?: string
  metadata?: Record<string, unknown>
}
