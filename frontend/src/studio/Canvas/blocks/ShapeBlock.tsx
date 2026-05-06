import { memo, useRef, useCallback, useEffect } from 'react'
import {
  Square, Circle as CircleIcon,
  Slash, Sparkles,
} from 'lucide-react'
import { useStudioStore } from '../../store/studioStore'
import FloatingToolbar, { TbButton, TbGroup, TbColorSwatch } from '../FloatingToolbar'
import type { Block, ShapeBlockConfig, ShapeType } from '../../types'

interface Props {
  block: Block
  isSelected: boolean
}

/* ── Shape path generator ─────────────────────────────────────────── */
export function shapePath(shape: ShapeType, w: number, h: number): string {
  const cx = w / 2
  const cy = h / 2
  switch (shape) {
    case 'rectangle':
      return ''
    case 'circle':
      return ''
    case 'ellipse':
      return ''
    case 'triangle':
      return `M${cx},0 L${w},${h} L0,${h} Z`
    case 'diamond':
      return `M${cx},0 L${w},${cy} L${cx},${h} L0,${cy} Z`
    case 'pentagon': {
      const r = Math.min(w, h) / 2
      const pts: string[] = []
      for (let i = 0; i < 5; i++) {
        const a = (Math.PI * 2 * i) / 5 - Math.PI / 2
        pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`)
      }
      return `M${pts.join(' L')} Z`
    }
    case 'hexagon': {
      const r = Math.min(w, h) / 2
      const pts: string[] = []
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI * 2 * i) / 6
        pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`)
      }
      return `M${pts.join(' L')} Z`
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
      return `M${pts.join(' L')} Z`
    }
    case 'heart': {
      const s = Math.min(w, h)
      const sx = w / s
      return `M${cx},${h * 0.85} C${cx - s * 0.45 * sx},${h * 0.55} ${cx - s * 0.45 * sx},${h * 0.10} ${cx},${h * 0.32} C${cx + s * 0.45 * sx},${h * 0.10} ${cx + s * 0.45 * sx},${h * 0.55} ${cx},${h * 0.85} Z`
    }
    case 'cloud': {
      // 4-bumpy cloud
      const r1 = h * 0.30
      const r2 = h * 0.36
      const r3 = h * 0.30
      return `M${w * 0.18},${h * 0.78}
              a${r1},${r1} 0 1,1 0,-${r1 * 1.4}
              a${r2},${r2} 0 0,1 ${w * 0.32},-${r2 * 0.6}
              a${r3},${r3} 0 0,1 ${w * 0.32},${r3 * 0.4}
              a${r1},${r1} 0 1,1 0,${r1 * 1.4} Z`.replace(/\s+/g, ' ')
    }
    case 'shield':
      return `M${cx},0 L${w},${h * 0.18} L${w},${h * 0.55} Q${w},${h * 0.92} ${cx},${h} Q0,${h * 0.92} 0,${h * 0.55} L0,${h * 0.18} Z`
    case 'speech': {
      const tail = `L${w * 0.18},${h * 0.85} L${w * 0.10},${h} L${w * 0.34},${h * 0.85}`
      return `M${w * 0.04},0 L${w * 0.96},0 Q${w},0 ${w},${h * 0.04} L${w},${h * 0.81} Q${w},${h * 0.85} ${w * 0.96},${h * 0.85} ${tail} L${w * 0.04},${h * 0.85} Q0,${h * 0.85} 0,${h * 0.81} L0,${h * 0.04} Q0,0 ${w * 0.04},0 Z`
    }
    case 'callout': {
      // Rectangle with a pointer on the bottom-center
      const r = Math.min(8, h * 0.06)
      const tipW = Math.min(20, w * 0.16)
      const tipH = Math.min(14, h * 0.14)
      const baseH = h - tipH
      return `M${r},0 L${w - r},0 Q${w},0 ${w},${r}
              L${w},${baseH - r} Q${w},${baseH} ${w - r},${baseH}
              L${cx + tipW / 2},${baseH} L${cx},${h} L${cx - tipW / 2},${baseH}
              L${r},${baseH} Q0,${baseH} 0,${baseH - r} L0,${r} Q0,0 ${r},0 Z`.replace(/\s+/g, ' ')
    }
    case 'ribbon': {
      const slot = h * 0.18
      const fold = w * 0.06
      return `M0,${slot} L${w * 0.5},0 L${w},${slot} L${w - fold},${h * 0.5} L${w},${h - slot} L${w * 0.5},${h} L0,${h - slot} L${fold},${h * 0.5} Z`
    }
    case 'blob': {
      // Asymmetric blob using bezier curves
      const r = Math.min(w, h) * 0.45
      return `M${cx - r * 0.7},${cy - r * 0.4}
              C${cx - r},${cy - r * 1.1} ${cx + r * 0.4},${cy - r * 1.2} ${cx + r * 0.9},${cy - r * 0.4}
              C${cx + r * 1.3},${cy + r * 0.2} ${cx + r * 0.6},${cy + r} ${cx + r * 0.1},${cy + r * 0.95}
              C${cx - r * 0.7},${cy + r * 1.05} ${cx - r * 1.1},${cy + r * 0.3} ${cx - r * 0.7},${cy - r * 0.4} Z`.replace(/\s+/g, ' ')
    }
    case 'cross': {
      const t = Math.min(w, h) * 0.30
      return `M${cx - t / 2},0 L${cx + t / 2},0 L${cx + t / 2},${cy - t / 2} L${w},${cy - t / 2} L${w},${cy + t / 2} L${cx + t / 2},${cy + t / 2} L${cx + t / 2},${h} L${cx - t / 2},${h} L${cx - t / 2},${cy + t / 2} L0,${cy + t / 2} L0,${cy - t / 2} L${cx - t / 2},${cy - t / 2} Z`
    }
    case 'arrow-right': {
      const head = Math.min(w, h) * 0.35
      const bodyY = h * 0.35
      return `M0,${bodyY} L${w - head},${bodyY} L${w - head},0 L${w},${h / 2} L${w - head},${h} L${w - head},${h - bodyY} L0,${h - bodyY} Z`
    }
    case 'arrow-up': {
      const head = Math.min(w, h) * 0.35
      const bodyX = w * 0.35
      return `M${bodyX},${h} L${bodyX},${head} L0,${head} L${w / 2},0 L${w},${head} L${w - bodyX},${head} L${w - bodyX},${h} Z`
    }
    case 'arrow-left': {
      const head = Math.min(w, h) * 0.35
      const bodyY = h * 0.35
      return `M${w},${bodyY} L${head},${bodyY} L${head},0 L0,${h / 2} L${head},${h} L${head},${h - bodyY} L${w},${h - bodyY} Z`
    }
    case 'arrow-down': {
      const head = Math.min(w, h) * 0.35
      const bodyX = w * 0.35
      return `M${bodyX},0 L${bodyX},${h - head} L0,${h - head} L${w / 2},${h} L${w},${h - head} L${w - bodyX},${h - head} L${w - bodyX},0 Z`
    }
    case 'arrow-double': {
      const head = Math.min(w, h) * 0.30
      const bodyY = h * 0.35
      return `M0,${h / 2} L${head},0 L${head},${bodyY} L${w - head},${bodyY} L${w - head},0 L${w},${h / 2} L${w - head},${h} L${w - head},${h - bodyY} L${head},${h - bodyY} L${head},${h} Z`
    }
    case 'line':
      return `M0,${h / 2} L${w},${h / 2}`
    default:
      return ''
  }
}

/* ── Inner shape SVG (no toolbar / handles) ───────────────────────── */
function ShapeSvg({ block }: { block: Block }) {
  const cfg = (block.config || {}) as ShapeBlockConfig
  const { w, h } = block.bounds
  const shape = cfg.shape || 'rectangle'
  const fill = cfg.fillColor || 'var(--accent)'
  const stroke = cfg.strokeColor || 'transparent'
  const sw = cfg.strokeWidth ?? 0
  const opacity = cfg.opacity ?? 1
  const rot = cfg.rotation ?? 0
  const rx = cfg.rounded ?? 0

  const transform = rot ? `rotate(${rot} ${w / 2} ${h / 2})` : undefined

  /* Optional gradient fill */
  const gradId = `sgrad-${block.id}`
  const useGradient = !!cfg.gradient && (fill?.startsWith('#') || fill?.startsWith('rgb'))
  const fillResolved = useGradient ? `url(#${gradId})` : fill

  const commonProps = {
    fill: fillResolved,
    stroke,
    strokeWidth: sw,
    opacity,
    transform,
  }

  let element: React.ReactNode

  if (shape === 'rectangle') {
    element = <rect x={0} y={0} width={w} height={h} rx={rx} {...commonProps} />
  } else if (shape === 'circle') {
    const r = Math.min(w, h) / 2
    element = <circle cx={w / 2} cy={h / 2} r={r} {...commonProps} />
  } else if (shape === 'ellipse') {
    element = <ellipse cx={w / 2} cy={h / 2} rx={w / 2} ry={h / 2} {...commonProps} />
  } else if (shape === 'line') {
    /* Line uses configurable endpoints (defaults to horizontal mid-line). */
    const x1 = cfg.lineX1 ?? 0
    const y1 = cfg.lineY1 ?? h / 2
    const x2 = cfg.lineX2 ?? w
    const y2 = cfg.lineY2 ?? h / 2
    const lineColor = stroke !== 'transparent' ? stroke : fill
    const dash = cfg.lineStyle === 'dashed'
      ? `${(sw || 3) * 4} ${(sw || 3) * 3}`
      : cfg.lineStyle === 'dotted'
      ? `${(sw || 3) * 1.2} ${(sw || 3) * 2}`
      : undefined
    element = (
      <>
        <defs>
          {cfg.lineEndArrow && (
            <marker id={`mE-${block.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth={8} markerHeight={8} orient="auto-start-reverse" markerUnits="strokeWidth">
              <path d="M0,0 L10,5 L0,10 Z" fill={lineColor as string} />
            </marker>
          )}
          {cfg.lineStartArrow && (
            <marker id={`mS-${block.id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth={8} markerHeight={8} orient="auto-start-reverse" markerUnits="strokeWidth">
              <path d="M0,0 L10,5 L0,10 Z" fill={lineColor as string} />
            </marker>
          )}
        </defs>
        <line
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={lineColor as string}
          strokeWidth={sw || 3}
          strokeDasharray={dash}
          strokeLinecap={dash ? 'butt' : 'round'}
          opacity={opacity}
          transform={transform}
          markerStart={cfg.lineStartArrow ? `url(#mS-${block.id})` : undefined}
          markerEnd={cfg.lineEndArrow ? `url(#mE-${block.id})` : undefined}
        />
      </>
    )
  } else {
    const d = shapePath(shape, w, h)
    element = <path d={d} {...commonProps} />
  }

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block" overflow="visible">
      <defs>
        {useGradient && (
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1"
            gradientTransform={`rotate(${cfg.gradientAngle ?? 135} 0.5 0.5)`}>
            <stop offset="0%" stopColor={fill} />
            <stop offset="100%" stopColor={cfg.gradientTo || shadeHex(fill, -25)} />
          </linearGradient>
        )}
        {cfg.shadow && (
          <filter id={`shape-shadow-${block.id}`} x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="rgba(0,0,0,0.35)" />
          </filter>
        )}
      </defs>
      <g filter={cfg.shadow ? `url(#shape-shadow-${block.id})` : undefined}>{element}</g>
    </svg>
  )
}

/* ── Public ShapeBlock with floating toolbar + line endpoints ─────── */
const ShapeBlockInner = memo(function ShapeBlockInner({ block, isSelected }: Props) {
  const cfg = (block.config || {}) as ShapeBlockConfig
  const containerRef = useRef<HTMLDivElement>(null)
  const { patchBlockConfig, updateBlock } = useStudioStore()

  const lastFillRef = useRef<string>(cfg.fillColor && cfg.fillColor !== 'transparent' ? cfg.fillColor : 'var(--accent)')
  const lastStrokeRef = useRef<string>(cfg.strokeColor && cfg.strokeColor !== 'transparent' ? cfg.strokeColor : 'var(--accent)')

  useEffect(() => {
    if (cfg.fillColor && cfg.fillColor !== 'transparent') lastFillRef.current = cfg.fillColor
  }, [cfg.fillColor])

  useEffect(() => {
    if (cfg.strokeColor && cfg.strokeColor !== 'transparent') lastStrokeRef.current = cfg.strokeColor
  }, [cfg.strokeColor])

  const update = useCallback((patch: Partial<ShapeBlockConfig>) => {
    patchBlockConfig(block.id, patch)
  }, [block.id, patchBlockConfig])

  const isLine = (cfg.shape || 'rectangle') === 'line'
  const hasFill = !!cfg.fillColor && cfg.fillColor !== 'transparent'
  const hasStroke = (cfg.strokeWidth ?? 0) > 0 && !!cfg.strokeColor && cfg.strokeColor !== 'transparent'

  const toggleFill = () => {
    if (hasFill) {
      const fallback = lastFillRef.current || 'var(--accent)'
      const patch: Partial<ShapeBlockConfig> = { fillColor: 'transparent' }
      if (!hasStroke) {
        patch.strokeColor = cfg.strokeColor && cfg.strokeColor !== 'transparent' ? cfg.strokeColor : fallback
        patch.strokeWidth = Math.max(cfg.strokeWidth ?? 0, 2)
      }
      update(patch)
      return
    }
    update({ fillColor: lastFillRef.current || 'var(--accent)' })
  }

  const toggleStroke = () => {
    if (hasStroke) {
      update({ strokeColor: 'transparent', strokeWidth: 0 })
      return
    }
    const fallback = lastStrokeRef.current || (cfg.fillColor && cfg.fillColor !== 'transparent' ? cfg.fillColor : 'var(--accent)')
    update({ strokeColor: fallback, strokeWidth: Math.max(cfg.strokeWidth ?? 0, 2) })
  }

  /* Line endpoint dragging — Canva-style click-and-drag resize. */
  const handleLineEndpointDrag = useCallback((endpoint: 'start' | 'end') => (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    const { w, h } = block.bounds
    const startX1 = cfg.lineX1 ?? 0
    const startY1 = cfg.lineY1 ?? h / 2
    const startX2 = cfg.lineX2 ?? w
    const startY2 = cfg.lineY2 ?? h / 2
    const startBounds = { ...block.bounds }
    const startClient = { x: e.clientX, y: e.clientY }

    const onMove = (ev: MouseEvent) => {
      const scale = useStudioStore.getState().canvasZoom / 100
      const dx = (ev.clientX - startClient.x) / scale
      const dy = (ev.clientY - startClient.y) / scale

      let nx1 = startX1, ny1 = startY1, nx2 = startX2, ny2 = startY2
      if (endpoint === 'start') { nx1 = startX1 + dx; ny1 = startY1 + dy }
      else                      { nx2 = startX2 + dx; ny2 = startY2 + dy }

      /* Compute new abs bbox of the two endpoints. */
      const absX1 = startBounds.x + nx1
      const absY1 = startBounds.y + ny1
      const absX2 = startBounds.x + nx2
      const absY2 = startBounds.y + ny2

      const pad = 6
      const minX = Math.min(absX1, absX2) - pad
      const minY = Math.min(absY1, absY2) - pad
      const maxX = Math.max(absX1, absX2) + pad
      const maxY = Math.max(absY1, absY2) + pad
      const nw = Math.max(8, maxX - minX)
      const nh = Math.max(8, maxY - minY)

      /* Rebase relative endpoints to new bounds origin. */
      const r1x = absX1 - minX
      const r1y = absY1 - minY
      const r2x = absX2 - minX
      const r2y = absY2 - minY

      updateBlock(block.id, {
        bounds: { x: Math.max(0, Math.round(minX)), y: Math.max(0, Math.round(minY)), w: Math.round(nw), h: Math.round(nh) },
        config: {
          ...(block.config as Record<string, unknown>),
          lineX1: r1x, lineY1: r1y,
          lineX2: r2x, lineY2: r2y,
        },
      })
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [block.id, block.bounds, block.config, cfg.lineX1, cfg.lineY1, cfg.lineX2, cfg.lineY2, updateBlock])

  /* Endpoints in canvas-relative coords for handle positioning. */
  const linePts = (() => {
    if (!isLine) return null
    const { w, h } = block.bounds
    return {
      x1: cfg.lineX1 ?? 0,
      y1: cfg.lineY1 ?? h / 2,
      x2: cfg.lineX2 ?? w,
      y2: cfg.lineY2 ?? h / 2,
    }
  })()

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <FloatingToolbar visible={isSelected} containerRef={containerRef}>
        <TbGroup>
          <button
            style={{
              height: 28, padding: '0 10px', borderRadius: 6, border: 'none',
              background: 'rgba(255,255,255,0.06)', color: '#fff',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
            onMouseDown={(e) => e.preventDefault()}
            title="Forma"
          >
            <Sparkles size={12} />
            {cfg.shape || 'rectangle'}
          </button>
        </TbGroup>

        <TbGroup>
          <TbButton active={!hasFill} onClick={toggleFill} title={hasFill ? 'Somente contorno' : 'Restaurar preenchimento'}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="5" y="5" width="14" height="14" fill={hasFill ? 'currentColor' : 'none'} stroke="currentColor" />
              {!hasFill && <line x1="4" y1="20" x2="20" y2="4" stroke="currentColor" strokeWidth="2" />}
            </svg>
          </TbButton>
          <TbColorSwatch value={cfg.fillColor || '#2563eb'} onChange={(c) => update({ fillColor: c })} title="Preenchimento" />
          <TbButton active={!hasStroke} onClick={toggleStroke} title={hasStroke ? 'Sem contorno' : 'Restaurar contorno'}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2">
              <rect x="5" y="5" width="14" height="14" fill="none" stroke="currentColor" />
              {!hasStroke && <line x1="4" y1="20" x2="20" y2="4" stroke="currentColor" strokeWidth="2" />}
            </svg>
          </TbButton>
          <TbColorSwatch value={cfg.strokeColor || 'transparent'} onChange={(c) => update({ strokeColor: c })} title="Contorno" />
        </TbGroup>

        <TbGroup>
          <TbButton onClick={() => update({ strokeWidth: Math.max(0, (cfg.strokeWidth ?? 0) - 1) })} title="Contorno −">−</TbButton>
          <span style={{ minWidth: 22, textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>
            {cfg.strokeWidth ?? 0}
          </span>
          <TbButton onClick={() => update({ strokeWidth: Math.min(20, (cfg.strokeWidth ?? 0) + 1) })} title="Contorno +">+</TbButton>
        </TbGroup>

        <TbGroup>
          <TbButton active={!!cfg.shadow} onClick={() => update({ shadow: !cfg.shadow })} title="Sombra">
            <Square size={13} />
          </TbButton>
          <TbButton active={!!cfg.gradient} onClick={() => update({ gradient: !cfg.gradient })} title="Gradiente">
            <CircleIcon size={13} />
          </TbButton>
        </TbGroup>

        <TbGroup>
          <TbButton onClick={() => update({ opacity: Math.max(0.1, (cfg.opacity ?? 1) - 0.1) })} title="− opacidade">−</TbButton>
          <span style={{ minWidth: 30, textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>
            {Math.round((cfg.opacity ?? 1) * 100)}%
          </span>
          <TbButton onClick={() => update({ opacity: Math.min(1, (cfg.opacity ?? 1) + 0.1) })} title="+ opacidade">+</TbButton>
        </TbGroup>

        {isLine && (
          <TbGroup last>
            <TbButton
              active={cfg.lineStyle === 'dashed'}
              onClick={() => update({ lineStyle: cfg.lineStyle === 'dashed' ? 'solid' : 'dashed' })}
              title="Tracejada"
            >
              <Slash size={13} />
            </TbButton>
            <TbButton
              active={!!cfg.lineEndArrow}
              onClick={() => update({ lineEndArrow: !cfg.lineEndArrow })}
              title="Ponta"
            >→</TbButton>
          </TbGroup>
        )}
      </FloatingToolbar>

      <ShapeSvg block={block} />

      {/* Line endpoint handles — visible only when selected. Drawn outside
          the shape SVG so they're always above and clickable. */}
      {isSelected && isLine && linePts && (
        <svg
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}
          width="100%"
          height="100%"
        >
          <g style={{ pointerEvents: 'auto' }}>
            <g
              onMouseDown={handleLineEndpointDrag('start')}
              style={{ cursor: 'grab' }}
            >
              <circle cx={linePts.x1} cy={linePts.y1} r={9} fill="white" stroke="var(--accent)" strokeWidth={2.5} />
              <circle cx={linePts.x1} cy={linePts.y1} r={3} fill="var(--accent)" />
            </g>
            <g
              onMouseDown={handleLineEndpointDrag('end')}
              style={{ cursor: 'grab' }}
            >
              <circle cx={linePts.x2} cy={linePts.y2} r={9} fill="white" stroke="var(--accent)" strokeWidth={2.5} />
              <circle cx={linePts.x2} cy={linePts.y2} r={3} fill="var(--accent)" />
            </g>
          </g>
        </svg>
      )}
    </div>
  )
})

export default ShapeBlockInner

/* ── Color helper (copied here to avoid circular import) ─────────── */
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
