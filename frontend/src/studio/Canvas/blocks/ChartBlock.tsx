import { useMemo, useRef, useState, useEffect } from 'react'
import {
  BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell,
  RadialBarChart, RadialBar,
  ComposedChart,
  Treemap,
  FunnelChart, Funnel,
  RadarChart, Radar, PolarAngleAxis, PolarRadiusAxis, PolarGrid,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  LabelList, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { Block, ChartBlockConfig, LegendPosition } from '../../types'

interface Props {
  block: Block
  isSelected: boolean
}

/* Neutral color palette (Brazil map style - blues, grays, earth tones) */
export const CHART_PALETTE = [
  '#2563eb', /* Primary Blue */
  '#4a7ba7', /* Medium Blue */
  '#6b8fb5', /* Light Blue */
  '#7a8a9a', /* Gray-Blue */
  '#5a6b7d', /* Slate */
  '#8b9aac', /* Soft Gray-Blue */
  '#3d5975', /* Dark Blue */
  '#6b7d8e', /* Muted Gray */
  '#8fa3b8', /* Pale Blue */
  '#556b7f', /* Deep Gray */
]

function resolveColors(cfg: ChartBlockConfig, dataLength = 0): string[] {
  const src = cfg.colors || []
  const out: string[] = []
  for (let i = 0; i < Math.max(dataLength, src.length); i++) {
    out[i] = src[i] || CHART_PALETTE[i % CHART_PALETTE.length]
  }
  return out.length ? out : CHART_PALETTE
}

const GRID_STROKE = 'rgba(255,255,255,0.08)'

/* ── Value formatter ── */
function formatValue(v: unknown, cfg: ChartBlockConfig): string {
  if (typeof v !== 'number') return String(v ?? '')
  const dec = cfg.valueDecimals ?? (Math.abs(v) >= 1000 ? 0 : (Number.isInteger(v) ? 0 : 1))
  const formatted = v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
  return `${cfg.valuePrefix || ''}${formatted}${cfg.valueSuffix || ''}`
}

/* ── Custom tooltip ── */
function CustomTooltip({ active, payload, label, textColor, cfg }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      background: 'rgba(15,25,40,0.94)',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 6,
      padding: '6px 10px',
      fontSize: 11,
      color: textColor || '#e2e8f0',
      backdropFilter: 'blur(8px)',
      boxShadow: '0 6px 16px rgba(0,0,0,0.32)',
    }}>
      {label && <div style={{ color: '#8899aa', marginBottom: 3, fontWeight: 500 }}>{label}</div>}
      {payload.map((p: any, i: number) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: p.fill || p.stroke }} />
          <span style={{ fontWeight: 600 }}>{formatValue(p.value, cfg)}</span>
        </div>
      ))}
    </div>
  )
}

interface CartesianElementsProps {
  showGrid: boolean
  textColor: string
  showLegend: boolean
  legendPos?: LegendPosition
  isHoriz?: boolean
  maxLabelLength?: number
  cfg: ChartBlockConfig
  tickFont?: { fontSize: number; fill: string }
  xAngle?: number
}

function CartesianElements({ showGrid, textColor, showLegend, legendPos = 'bottom', isHoriz = false, maxLabelLength = 6, cfg, tickFont, xAngle }: CartesianElementsProps) {
  const tf = tickFont || { fontSize: 10, fill: '#8899aa' }
  return (
    <>
      {showGrid && (
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={GRID_STROKE}
          vertical={isHoriz}
          horizontal={!isHoriz}
        />
      )}
      {isHoriz ? (
        <>
          <XAxis type="number" tick={tf} tickLine={false} axisLine={false}
            tickFormatter={(v) => formatValue(v, cfg)} />
          <YAxis type="category" dataKey="name" tick={tf} tickLine={false} axisLine={false}
            width={Math.min(8 * maxLabelLength + 12, 140)} />
        </>
      ) : (
        <>
          <XAxis dataKey="name" tick={{ ...tf, angle: xAngle ?? 0, textAnchor: xAngle ? 'end' : 'inherit' }} tickLine={false} axisLine={false} interval={0} />
          <YAxis tick={tf} tickLine={false} axisLine={false}
            tickFormatter={(v) => formatValue(v, cfg)} />
        </>
      )}
      <Tooltip content={<CustomTooltip textColor={textColor} cfg={cfg} />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
      {showLegend && (
        <Legend
          wrapperStyle={{ fontSize: 10, color: textColor }}
          verticalAlign={legendPos === 'top' ? 'top' : legendPos === 'bottom' ? 'bottom' : 'middle'}
          align={legendPos === 'left' ? 'left' : legendPos === 'right' ? 'right' : 'center'}
          layout={legendPos === 'left' || legendPos === 'right' ? 'vertical' : 'horizontal'}
        />
      )}
      {cfg.referenceValue !== undefined && cfg.referenceValue !== null && (
        <ReferenceLine
          y={!isHoriz ? cfg.referenceValue : undefined}
          x={isHoriz ? cfg.referenceValue : undefined}
          stroke="#dc2626"
          strokeDasharray="4 3"
          strokeWidth={1.2}
          label={{
            value: cfg.referenceLabel || `${formatValue(cfg.referenceValue, cfg)}`,
            position: isHoriz ? 'top' : 'right',
            fill: '#dc2626',
            fontSize: 10,
            fontWeight: 600,
          }}
        />
      )}
    </>
  )
}

export default function ChartBlock({ block, isSelected }: Props) {
  const cfg = (block.config || {}) as ChartBlockConfig
  const { labels = [], values = [] } = cfg.data || {}
  const textColor = cfg.textColor || '#c8d4e0'
  const showGrid = cfg.showGrid !== false
  const showValues = cfg.showValues || false
  const showLegend = cfg.showLegend || false
  const legendPos = cfg.legendPosition || 'bottom'
  const strokeWidth = cfg.strokeWidth ?? 2
  const curved = cfg.curved !== false
  const rounded = cfg.rounded !== false
  const barSize = cfg.barSize ?? 0
  const fontSize = cfg.fontSize ?? 10
  const barColor = cfg.barColor || '#7a8a9a'

  const data = useMemo(() => {
    let items = labels.map((label, i) => ({ name: label, value: values[i] ?? 0 }))
    const sort = cfg.sortMode || 'none'
    if (sort === 'valueAsc') items = [...items].sort((a, b) => a.value - b.value)
    else if (sort === 'valueDesc') items = [...items].sort((a, b) => b.value - a.value)
    else if (sort === 'labelAsc') items = [...items].sort((a, b) => a.name.localeCompare(b.name))
    else if (sort === 'labelDesc') items = [...items].sort((a, b) => b.name.localeCompare(a.name))
    return items
  }, [labels, values, cfg.sortMode])

  const tickFont = { fontSize, fill: '#8899aa' }
  const colors = useMemo(() => resolveColors(cfg, data.length), [cfg, data.length])
  const isEmpty = data.length === 0

  const maxLabelLength = useMemo(() => {
    if (!data.length) return 6
    return Math.max(...data.map((d) => String(d.name).length))
  }, [data])

  const containerStyle: React.CSSProperties = useMemo(() => ({
    width: '100%',
    height: '100%',
    background: cfg.backgroundColor || 'transparent',
    borderRadius: 8,
    display: 'flex',
    flexDirection: 'column',
    padding: cfg.title || cfg.subtitle ? '12px 14px 6px' : '6px 8px',
    overflow: 'hidden',
    outline: isSelected ? '2px solid var(--accent)' : undefined,
    outlineOffset: -2,
    boxSizing: 'border-box',
  }), [cfg.backgroundColor, cfg.title, cfg.subtitle, isSelected])

  const chartWrapRef = useRef<HTMLDivElement>(null)
  const [wrapSize, setWrapSize] = useState({ width: 0, height: 0 })

  useEffect(() => {
    const el = chartWrapRef.current
    if (!el) return
    let raf = 0
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect
        const w = Math.round(cr.width)
        const h = Math.round(cr.height)
        cancelAnimationFrame(raf)
        raf = requestAnimationFrame(() => {
          setWrapSize((prev) => {
            if (prev.width === w && prev.height === h) return prev
            return { width: w, height: h }
          })
        })
      }
    })
    ro.observe(el)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [])

  if (isEmpty) {
    return (
      <div style={containerStyle}>
        {(cfg.title || cfg.subtitle) && <ChartTitle cfg={cfg} textColor={textColor} />}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#445566', fontSize: 11 }}>
          Adicione dados nas propriedades
        </div>
      </div>
    )
  }

  const axisPad = cfg.axisPadding ?? 8
  const xAngle = cfg.xLabelAngle ?? 0
  const margin = useMemo(() => ({ top: showValues ? 18 : 6, right: 14, bottom: 4, left: axisPad }), [showValues, axisPad])
  const color0 = barColor

  const barRadius: [number, number, number, number] = useMemo(() => rounded ? [4, 4, 0, 0] : [0, 0, 0, 0], [rounded])
  const barProps = useMemo(() => ({
    dataKey: 'value' as const,
    fill: barColor,
    radius: barRadius,
    ...(barSize ? { barSize } : {}),
  }), [barColor, barRadius, barSize])

  function renderChart() {
    switch (cfg.chartType) {
      case 'bar':
        if (cfg.horizontal) {
          return (
            <BarChart data={data} layout="vertical" margin={margin}>
              <CartesianElements cfg={cfg} showGrid={showGrid} textColor={textColor} showLegend={showLegend} legendPos={legendPos} isHoriz maxLabelLength={maxLabelLength} tickFont={tickFont} xAngle={xAngle} />
              <Bar dataKey="value" fill={barColor} radius={rounded ? [0, 4, 4, 0] : undefined} {...(barSize ? { barSize } : {})}>
                {showValues && (
                  <LabelList dataKey="value" position="right" style={{ fontSize, fill: textColor, fontWeight: 600 }}
                    formatter={(v: any) => formatValue(v, cfg)} />
                )}
              </Bar>
            </BarChart>
          )
        }
        return (
          <BarChart data={data} margin={margin}>
            <CartesianElements cfg={cfg} showGrid={showGrid} textColor={textColor} showLegend={showLegend} legendPos={legendPos} tickFont={tickFont} xAngle={xAngle} />
            <Bar {...barProps}>
              {showValues && (
                <LabelList dataKey="value" position="top" style={{ fontSize, fill: textColor, fontWeight: 600 }}
                  formatter={(v: any) => formatValue(v, cfg)} />
              )}
            </Bar>
          </BarChart>
        )

      case 'line':
        return (
          <LineChart data={data} margin={margin}>
            <CartesianElements cfg={cfg} showGrid={showGrid} textColor={textColor} showLegend={showLegend} legendPos={legendPos} tickFont={tickFont} xAngle={xAngle} />
            <Line
              type={curved ? 'monotone' : 'linear'}
              dataKey="value"
              stroke={color0}
              strokeWidth={strokeWidth}
              dot={{ fill: color0, r: 3, strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            >
              {showValues && (
                <LabelList dataKey="value" position="top" style={{ fontSize: 9, fill: textColor, fontWeight: 600 }}
                  formatter={(v: any) => formatValue(v, cfg)} />
              )}
            </Line>
          </LineChart>
        )

      case 'area':
        return (
          <AreaChart data={data} margin={margin}>
            <defs>
              <linearGradient id={`area-grad-${block.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color0} stopOpacity={0.42} />
                <stop offset="95%" stopColor={color0} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianElements cfg={cfg} showGrid={showGrid} textColor={textColor} showLegend={showLegend} legendPos={legendPos} tickFont={tickFont} xAngle={xAngle} />
            <Area
              type={curved ? 'monotone' : 'linear'}
              dataKey="value"
              stroke={color0}
              strokeWidth={strokeWidth}
              fill={`url(#area-grad-${block.id})`}
              dot={{ fill: color0, r: 3, strokeWidth: 0 }}
            >
              {showValues && (
                <LabelList dataKey="value" position="top" style={{ fontSize: 9, fill: textColor, fontWeight: 600 }}
                  formatter={(v: any) => formatValue(v, cfg)} />
              )}
            </Area>
          </AreaChart>
        )

      case 'pie':
        return (
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              outerRadius="80%"
              paddingAngle={2}
              startAngle={90}
              endAngle={-270}
              label={showValues
                ? ({ name, percent }: any) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                : undefined}
              labelLine={showValues}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} stroke="none" />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip textColor={textColor} cfg={cfg} />} />
            {showLegend && <Legend wrapperStyle={{ fontSize: 10, color: textColor }}
              verticalAlign={legendPos === 'top' ? 'top' : legendPos === 'bottom' ? 'bottom' : 'middle'}
              align={legendPos === 'left' ? 'left' : legendPos === 'right' ? 'right' : 'center'}
              layout={legendPos === 'left' || legendPos === 'right' ? 'vertical' : 'horizontal'} />}
          </PieChart>
        )

      case 'donut': {
        const inner = cfg.innerRadius ?? 55
        return (
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={`${inner}%`}
              outerRadius="80%"
              paddingAngle={3}
              startAngle={90}
              endAngle={-270}
              label={showValues
                ? ({ name, percent }: any) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                : undefined}
              labelLine={showValues}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} stroke="none" />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip textColor={textColor} cfg={cfg} />} />
            {showLegend && <Legend wrapperStyle={{ fontSize: 10, color: textColor }}
              verticalAlign={legendPos === 'top' ? 'top' : legendPos === 'bottom' ? 'bottom' : 'middle'}
              align={legendPos === 'left' ? 'left' : legendPos === 'right' ? 'right' : 'center'}
              layout={legendPos === 'left' || legendPos === 'right' ? 'vertical' : 'horizontal'} />}
          </PieChart>
        )
      }

      case 'scatter':
        return (
          <BarChart data={data} margin={margin}>
            <CartesianElements cfg={cfg} showGrid={showGrid} textColor={textColor} showLegend={showLegend} legendPos={legendPos} tickFont={tickFont} xAngle={xAngle} />
            <Bar {...barProps} shape={<ScatterDot colors={colors} />} />
          </BarChart>
        )

      case 'radial': {
        const radialData = data.map((d, i) => ({ ...d, fill: colors[i % colors.length] }))
        return (
          <RadialBarChart
            data={radialData}
            innerRadius="20%"
            outerRadius="95%"
            startAngle={90}
            endAngle={-270}
            barCategoryGap={2}
          >
            <RadialBar dataKey="value" background={{ fill: 'rgba(125,140,160,0.10)' }} cornerRadius={8} />
            <Tooltip content={<CustomTooltip textColor={textColor} cfg={cfg} />} />
            {showLegend && <Legend wrapperStyle={{ fontSize: 10, color: textColor }}
              verticalAlign={legendPos === 'top' ? 'top' : 'bottom'}
              align={legendPos === 'left' ? 'left' : legendPos === 'right' ? 'right' : 'center'} />}
          </RadialBarChart>
        )
      }

      case 'stacked': {
        /* Stacked uses values + values2 (if present); falls back to half-and-half. */
        const stacked = labels.map((label, i) => {
          const v1 = values[i] ?? 0
          const v2 = (cfg.data?.values2?.[i]) ?? Math.round(v1 * 0.45)
          return { name: label, a: v1, b: v2 }
        })
        return (
          <BarChart data={stacked} margin={margin}>
            <CartesianElements cfg={cfg} showGrid={showGrid} textColor={textColor} showLegend={showLegend} legendPos={legendPos} tickFont={tickFont} xAngle={xAngle} />
            <Bar dataKey="a" stackId="s" fill={colors[0]} radius={rounded ? [0, 0, 0, 0] : undefined} />
            <Bar dataKey="b" stackId="s" fill={colors[1] || colors[0]} radius={rounded ? [4, 4, 0, 0] : undefined} />
          </BarChart>
        )
      }

      case 'grouped': {
        const grouped = labels.map((label, i) => {
          const v1 = values[i] ?? 0
          const v2 = (cfg.data?.values2?.[i]) ?? 0
          return { name: label, a: v1, b: v2 }
        })
        const series1Label = cfg.data?.datasetLabel || 'Série 1'
        const series2Label = cfg.data?.dataset2Label || 'Série 2'
        const color2 = cfg.series2Color || colors[1] || '#4a7ba7'
        const useDualAxis = cfg.dualAxis === true
        const leftAxisId = 'left'
        const rightAxisId = 'right'
        return (
          <BarChart data={grouped} margin={margin}>
            <CartesianElements cfg={cfg} showGrid={showGrid} textColor={textColor} showLegend={showLegend} legendPos={legendPos} tickFont={tickFont} xAngle={xAngle} />
            <YAxis yAxisId={leftAxisId} tick={tickFont} tickLine={false} axisLine={false}
              tickFormatter={(v) => formatValue(v, cfg)} width={Math.max(36, axisPad * 3)} />
            {useDualAxis && (
              <YAxis yAxisId={rightAxisId} orientation="right" tick={tickFont} tickLine={false} axisLine={false}
                tickFormatter={(v) => formatValue(v, cfg)} width={Math.max(36, axisPad * 3)} />
            )}
            <Bar yAxisId={leftAxisId} dataKey="a" name={series1Label} fill={barColor} radius={rounded ? [4, 4, 0, 0] : undefined} {...(barSize ? { barSize } : {})} />
            <Bar yAxisId={useDualAxis ? rightAxisId : leftAxisId} dataKey="b" name={series2Label} fill={color2} radius={rounded ? [4, 4, 0, 0] : undefined} {...(barSize ? { barSize } : {})} />
          </BarChart>
        )
      }

      case 'composed': {
        /* Composed = bars + line. Uses values for bars, values2 for line. */
        const composed = labels.map((label, i) => {
          const v1 = values[i] ?? 0
          const v2 = (cfg.data?.values2?.[i]) ?? Math.round(v1 * 0.7)
          return { name: label, bar: v1, trend: v2 }
        })
        return (
          <ComposedChart data={composed} margin={margin}>
            <CartesianElements cfg={cfg} showGrid={showGrid} textColor={textColor} showLegend={showLegend} legendPos={legendPos} tickFont={tickFont} xAngle={xAngle} />
            <Bar dataKey="bar" fill={colors[0]} radius={rounded ? [4, 4, 0, 0] : undefined} {...(barSize ? { barSize } : {})} />
            <Line type={curved ? 'monotone' : 'linear'} dataKey="trend" stroke={colors[1] || '#dc2626'} strokeWidth={strokeWidth} dot={{ r: 3, fill: colors[1] || '#dc2626' }} />
          </ComposedChart>
        )
      }

      case 'treemap': {
        const treeData = data.map((d, i) => ({
          name: d.name,
          size: Math.abs(d.value) || 1,
          fill: colors[i % colors.length],
        }))
        return (
          <Treemap
            data={treeData}
            dataKey="size"
            nameKey="name"
            stroke="rgba(255,255,255,0.08)"
            content={({ x, y, width, height, name, fill }: any) => {
              if (width < 2 || height < 2) return <rect x={x} y={y} width={width} height={height} fill={fill} />
              return (
                <g>
                  <rect x={x} y={y} width={width} height={height} fill={fill} stroke="rgba(255,255,255,0.08)" strokeWidth={1} rx={3} ry={3} />
                  {width > 36 && height > 14 && (
                    <text x={x + width / 2} y={y + height / 2} textAnchor="middle" dominantBaseline="middle" fill={textColor} fontSize={10} fontWeight={600}>
                      {name.length > 8 ? name.slice(0, 7) + '…' : name}
                    </text>
                  )}
                </g>
              )
            }}
          >
            <Tooltip content={<CustomTooltip textColor={textColor} cfg={cfg} />} />
          </Treemap>
        )
      }

      case 'funnel': {
        const funnelData = data.map((d, i) => ({
          name: d.name,
          value: d.value,
          fill: colors[i % colors.length],
        }))
        return (
          <FunnelChart>
            <Tooltip content={<CustomTooltip textColor={textColor} cfg={cfg} />} />
            <Funnel
              dataKey="value"
              data={funnelData}
              isAnimationActive
            >
              {funnelData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
              {showValues && (
                <LabelList dataKey="name" position="right" style={{ fontSize: 9, fill: textColor, fontWeight: 600 }} />
              )}
            </Funnel>
            {showLegend && <Legend wrapperStyle={{ fontSize: 10, color: textColor }} />}
          </FunnelChart>
        )
      }

      case 'radar': {
        const radarMax = cfg.radarMax || Math.max(...values.map(Math.abs), 1) * 1.15
        return (
          <RadarChart cx="50%" cy="50%" outerRadius="75%" data={data}>
            <PolarGrid stroke={GRID_STROKE} />
            <PolarAngleAxis dataKey="name" tick={{ fill: textColor, fontSize: 10 }} />
            <PolarRadiusAxis angle={30} tick={{ fill: '#8899aa', fontSize: 8 }} domain={[0, radarMax]} />
            <Radar name={cfg.data?.datasetLabel || 'Valores'} dataKey="value" stroke={color0} fill={color0} fillOpacity={0.25} strokeWidth={strokeWidth} />
            <Tooltip content={<CustomTooltip textColor={textColor} cfg={cfg} />} />
            {showLegend && <Legend wrapperStyle={{ fontSize: 10, color: textColor }} />}
          </RadarChart>
        )
      }

      default:
        return (
          <BarChart data={data} margin={margin}>
            <CartesianElements cfg={cfg} showGrid={showGrid} textColor={textColor} showLegend={showLegend} legendPos={legendPos} tickFont={tickFont} xAngle={xAngle} />
            <Bar {...barProps}>
              {data.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
            </Bar>
          </BarChart>
        )
    }
  }

  const canRender = wrapSize.width > 0 && wrapSize.height > 0

  /* For donut: render center label OVER the chart */
  const isDonut = cfg.chartType === 'donut'
  const total = useMemo(() => values.reduce((a, b) => a + (b || 0), 0), [values])

  return (
    <div style={containerStyle}>
      {(cfg.title || cfg.subtitle) && <ChartTitle cfg={cfg} textColor={textColor} />}
      <div ref={chartWrapRef} style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {canRender && (
          <ResponsiveContainer width={wrapSize.width} height={wrapSize.height}>
            {renderChart() as any}
          </ResponsiveContainer>
        )}
        {isDonut && (cfg.centerLabel !== undefined || true) && (
          <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <div style={{
              fontSize: 22, fontWeight: 700, color: textColor,
              fontFamily: 'var(--font-condensed)',
              lineHeight: 1.05,
            }}>
              {cfg.centerLabel || formatValue(total, cfg)}
            </div>
            {cfg.centerSubLabel && (
              <div style={{ fontSize: 10, color: '#7a8a9a', marginTop: 2 }}>
                {cfg.centerSubLabel}
              </div>
            )}
          </div>
        )}
      </div>
      {cfg.source && (
        <div style={{
          fontSize: 9, color: '#7a8a9a',
          marginTop: 4, paddingTop: 4,
          borderTop: '1px solid rgba(255,255,255,0.06)',
          fontStyle: 'italic',
          letterSpacing: 0.2,
        }}>
          Fonte: {cfg.source}
        </div>
      )}
    </div>
  )
}

function ChartTitle({ cfg, textColor }: { cfg: ChartBlockConfig; textColor: string }) {
  return (
    <div style={{ marginBottom: 6, lineHeight: 1.3 }}>
      {cfg.title && (
        <div style={{ fontSize: 13, fontWeight: 700, color: textColor, letterSpacing: 0.2 }}>
          {cfg.title}
        </div>
      )}
      {cfg.subtitle && (
        <div style={{ fontSize: 10, color: '#7a8a9a', marginTop: 1 }}>
          {cfg.subtitle}
        </div>
      )}
    </div>
  )
}

function ScatterDot({ x, y, width, height, index, colors }: any) {
  if (x == null) return null
  const cx = x + width / 2
  const cy = y + height / 2
  const r = Math.min(width, height) * 0.35
  const color = (colors || CHART_PALETTE)[index % (colors || CHART_PALETTE).length]
  return <circle cx={cx} cy={cy} r={r} fill={color} fillOpacity={0.85} />
}
