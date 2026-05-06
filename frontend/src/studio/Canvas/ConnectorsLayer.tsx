/**
 * ConnectorsLayer — renders all connector blocks at canvas-absolute
 * coordinates (i.e., in the same coordinate space as block.bounds).
 *
 * Connectors are NOT rendered through BlockRenderer because BlockRenderer
 * positions content inside a clipping container. A connector spanning two
 * far-apart blocks would be clipped to its own bounds.
 *
 * Hit testing: the SVG paths use pointer-events on a thicker invisible
 * "hit" path, so clicking near the line still selects the connector.
 *
 * When selected, draggable handles appear at each endpoint and at the
 * midpoint (for curvature/bow editing).
 */
import { useMemo, useCallback } from 'react'
import { useStudioStore } from '../store/studioStore'
import type { Block, ConnectorBlockConfig, MarkerType } from '../types'
import {
  buildPathD, getAnchorPoint, MARKER_SPECS,
  type Point,
} from './blocks/ConnectorBlock'

interface Props {
  blocks: Block[]
  canvasW: number
  canvasH: number
}

export default function ConnectorsLayer({ blocks, canvasW, canvasH }: Props) {
  const { selectedBlockId, selectedBlockIds, selectBlock, patchBlockConfig } = useStudioStore()
  const connectors = useMemo(
    () => blocks.filter((b) => b.type === 'connector'),
    [blocks]
  )

  if (connectors.length === 0) return null

  return (
    <svg
      style={{
        position: 'absolute',
        left: 0, top: 0,
        width: canvasW,
        height: canvasH,
        zIndex: 50,
        overflow: 'visible',
        pointerEvents: 'none',
      }}
      viewBox={`0 0 ${canvasW} ${canvasH}`}
    >
      <defs>
        {connectors.map((c) => (
          <ConnectorMarkers key={c.id} block={c} />
        ))}
      </defs>
      {connectors.map((c) => (
        <g key={c.id} data-block-id={c.id} data-block-type="connector">
          <ConnectorPath
            block={c}
            allBlocks={blocks}
            isSelected={selectedBlockId === c.id || selectedBlockIds.includes(c.id)}
            onSelect={(e) => {
              if (e.ctrlKey || e.metaKey) {
                useStudioStore.getState().toggleBlockSelection(c.id)
              } else {
                selectBlock(c.id)
              }
            }}
            patchConfig={(patch) => patchBlockConfig(c.id, patch)}
          />
        </g>
      ))}
    </svg>
  )
}

/* ── Marker defs (per-connector to allow independent colors) ───────── */
function ConnectorMarkers({ block }: { block: Block }) {
  const cfg = (block.config || {}) as ConnectorBlockConfig
  const color = cfg.color || '#2563eb'
  const startM = cfg.startMarker || 'none'
  const endM = cfg.endMarker || (cfg.arrowEnd !== false ? 'arrow' : 'none')
  const startSc = cfg.startMarkerSize ?? 1
  const endSc = cfg.endMarkerSize ?? 1
  return (
    <>
      {startM !== 'none' && (
        <ReactMarker id={`ms-${block.id}`} type={startM} color={color} scale={startSc} />
      )}
      {endM !== 'none' && (
        <ReactMarker id={`me-${block.id}`} type={endM} color={color} scale={endSc} />
      )}
      {cfg.shadow !== false && (
        <filter id={`fshadow-${block.id}`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.6" floodColor="rgba(0,0,0,0.40)" floodOpacity={0.7} />
        </filter>
      )}
    </>
  )
}

function ReactMarker({ id, type, color, scale }: { id: string; type: MarkerType; color: string; scale: number }) {
  const spec = MARKER_SPECS[type]
  if (!spec) return null
  const w = spec.vbW * scale * 0.8
  const h = spec.vbH * scale * 0.8
  return (
    <marker
      id={id}
      markerUnits="strokeWidth"
      markerWidth={w}
      markerHeight={h}
      viewBox={`0 0 ${spec.vbW} ${spec.vbH}`}
      refX={spec.refX}
      refY={spec.refY}
      orient="auto-start-reverse"
      dangerouslySetInnerHTML={{ __html: spec.body(color) }}
    />
  )
}

/* ── Single connector path + handles ───────────────────────────────── */

interface PathProps {
  block: Block
  allBlocks: Block[]
  isSelected: boolean
  onSelect: (e: React.MouseEvent) => void
  patchConfig: (patch: Record<string, unknown>) => void
}

function ConnectorPath({ block, allBlocks, isSelected, onSelect, patchConfig }: PathProps) {
  const cfg = (block.config || {}) as ConnectorBlockConfig
  const fromAnchor = cfg.fromAnchor || {}
  const toAnchor = cfg.toAnchor || {}

  const fromBlock = fromAnchor.blockId ? allBlocks.find((b) => b.id === fromAnchor.blockId) : undefined
  const toBlock = toAnchor.blockId ? allBlocks.find((b) => b.id === toAnchor.blockId) : undefined

  const fallbackFrom: Point = { x: block.bounds.x, y: block.bounds.y + block.bounds.h / 2 }
  const fallbackTo: Point = { x: block.bounds.x + block.bounds.w, y: block.bounds.y + block.bounds.h / 2 }

  const from = getAnchorPoint(fromBlock, fromAnchor, fallbackFrom)
  const to = getAnchorPoint(toBlock, toAnchor, fallbackTo)

  const color = resolveCssColor(cfg.color || 'var(--accent)')
  const strokeW = cfg.strokeWidth ?? 2
  const opacity = cfg.opacity ?? 1
  const style = cfg.style || 'curved'
  const curvature = cfg.curvature ?? 0.5
  const bow = cfg.bow ?? 0.4

  const dashPattern = (() => {
    const p = cfg.dashPattern || (cfg.dashed ? 'dashed' : 'solid')
    if (p === 'dashed') return `${strokeW * 4} ${strokeW * 3}`
    if (p === 'dotted') return `${strokeW * 1.2} ${strokeW * 2}`
    if (p === 'dashLong') return `${strokeW * 8} ${strokeW * 4}`
    return undefined
  })()

  const startM = cfg.startMarker || 'none'
  const endM = cfg.endMarker || (cfg.arrowEnd !== false ? 'arrow' : 'none')

  const pathD = useMemo(
    () => buildPathD(from, to, style, curvature, bow),
    [from.x, from.y, to.x, to.y, style, curvature, bow]
  )

  /* Hit detection: invisible thick path catches clicks near the line. */
  const hitPath = (
    <path
      d={pathD}
      stroke="transparent"
      strokeWidth={Math.max(14, strokeW + 12)}
      fill="none"
      style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
      onMouseDown={(e) => { e.stopPropagation(); onSelect(e) }}
    />
  )

  /* Endpoint dragging */
  const handleEndpointDrag = useCallback((endpoint: 'from' | 'to') => (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    onSelect(e)
    const board = (e.currentTarget as SVGElement).ownerSVGElement?.parentElement
    if (!board) return
    const onMove = (ev: MouseEvent) => {
      const rect = board.getBoundingClientRect()
      const scale = useStudioStore.getState().canvasZoom / 100
      const cx = (ev.clientX - rect.left) / scale
      const cy = (ev.clientY - rect.top) / scale
      // Snap to nearby block anchor if within 14px
      const snapped = findSnap(cx, cy, allBlocks, block.id, 14)
      const key = endpoint === 'from' ? 'fromAnchor' : 'toAnchor'
      patchConfig({ [key]: snapped || { x: cx, y: cy } })
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [allBlocks, block.id, onSelect, patchConfig])

  /* Curvature handle drag (for curved/sCurve/arc) */
  const midPoint = midOnPath(pathD)
  const handleMidDrag = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    onSelect(e)
    const board = (e.currentTarget as SVGElement).ownerSVGElement?.parentElement
    if (!board) return
    const startCx = midPoint.x
    const startCy = midPoint.y
    const dx = to.x - from.x
    const dy = to.y - from.y
    const dist = Math.hypot(dx, dy) || 1
    const nx = -dy / dist
    const ny = dx / dist
    const onMove = (ev: MouseEvent) => {
      const rect = board.getBoundingClientRect()
      const scale = useStudioStore.getState().canvasZoom / 100
      const cx = (ev.clientX - rect.left) / scale
      const cy = (ev.clientY - rect.top) / scale
      // Project displacement onto the perpendicular axis
      const offset = (cx - startCx) * nx + (cy - startCy) * ny
      if (style === 'curved') {
        // Map perpendicular offset to curvature in [0.1..0.9]
        const norm = Math.max(0.1, Math.min(0.9, 0.5 + offset / dist))
        patchConfig({ curvature: norm })
      } else if (style === 'sCurve' || style === 'arc') {
        const norm = Math.max(-1, Math.min(1, offset / (dist * 0.5)))
        patchConfig({ bow: norm })
      }
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [midPoint.x, midPoint.y, from.x, from.y, to.x, to.y, style, onSelect, patchConfig])

  return (
    <g style={{ pointerEvents: 'auto' }}>
      {/* Selection halo */}
      {isSelected && (
        <path
          d={pathD}
          stroke={resolveCssColor('var(--accent)')}
          strokeWidth={strokeW + 5}
          fill="none"
          opacity={0.20}
          strokeLinecap="round"
        />
      )}
      {/* Hit area */}
      {hitPath}
      {/* Real path */}
      <path
        d={pathD}
        stroke={color}
        strokeWidth={strokeW}
        opacity={opacity}
        fill="none"
        strokeDasharray={dashPattern}
        strokeLinecap={dashPattern ? 'butt' : 'round'}
        strokeLinejoin="round"
        markerStart={startM !== 'none' ? `url(#ms-${block.id})` : undefined}
        markerEnd={endM !== 'none' ? `url(#me-${block.id})` : undefined}
        filter={cfg.shadow !== false ? `url(#fshadow-${block.id})` : undefined}
        style={{ pointerEvents: 'none' }}
      />
      {/* Label */}
      {cfg.label && (
        <ConnectorLabel
          x={midPoint.x}
          y={midPoint.y}
          text={cfg.label}
          color={cfg.labelColor || resolveCssColor('var(--text)')}
          background={cfg.labelBackground || 'rgba(15,25,40,0.92)'}
          fontSize={cfg.labelFontSize || 11}
        />
      )}
      {/* Endpoint + midpoint handles when selected */}
      {isSelected && (
        <>
          <EndpointHandle
            x={from.x} y={from.y}
            onDown={handleEndpointDrag('from')}
            color={resolveCssColor('var(--accent)')}
          />
          <EndpointHandle
            x={to.x} y={to.y}
            onDown={handleEndpointDrag('to')}
            color={resolveCssColor('var(--accent)')}
          />
          {(style === 'curved' || style === 'sCurve' || style === 'arc') && (
            <CurvatureHandle x={midPoint.x} y={midPoint.y} onDown={handleMidDrag} />
          )}
        </>
      )}
    </g>
  )
}

function ConnectorLabel({ x, y, text, color, background, fontSize }: {
  x: number; y: number; text: string; color: string; background: string; fontSize: number
}) {
  const padX = 6
  const padY = 3
  // Approximate width — in real SVG you'd measure with getBBox, but for layout simplicity
  // we use a heuristic that works well at 9–14px.
  const w = text.length * fontSize * 0.55 + padX * 2
  const h = fontSize + padY * 2
  return (
    <g transform={`translate(${x - w / 2}, ${y - h / 2})`} style={{ pointerEvents: 'none' }}>
      <rect width={w} height={h} rx={4} fill={background} stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />
      <text x={w / 2} y={h - padY - 1} textAnchor="middle"
        fill={color}
        fontFamily="var(--font-condensed, system-ui)"
        fontSize={fontSize}
        fontWeight={600}
        letterSpacing="0.2px">
        {text}
      </text>
    </g>
  )
}

function EndpointHandle({ x, y, color, onDown }: { x: number; y: number; color: string; onDown: (e: React.MouseEvent) => void }) {
  return (
    <g style={{ cursor: 'grab', pointerEvents: 'auto' }} onMouseDown={onDown}>
      <circle cx={x} cy={y} r={8} fill="white" stroke={color} strokeWidth="2.5" />
      <circle cx={x} cy={y} r={3} fill={color} />
    </g>
  )
}

function CurvatureHandle({ x, y, onDown }: { x: number; y: number; onDown: (e: React.MouseEvent) => void }) {
  return (
    <g style={{ cursor: 'grab', pointerEvents: 'auto' }} onMouseDown={onDown}>
      <circle cx={x} cy={y} r={6} fill="white" stroke="rgba(76,134,184,0.9)" strokeWidth="2"
        strokeDasharray="2 2" />
      <circle cx={x} cy={y} r={1.5} fill="rgba(76,134,184,0.9)" />
    </g>
  )
}

/* ── Helpers ───────────────────────────────────────────────────────── */

function midOnPath(d: string): Point {
  // Use a temporary SVGPathElement to evaluate at 50%; falls back to bbox center
  if (typeof document === 'undefined') return { x: 0, y: 0 }
  const ns = 'http://www.w3.org/2000/svg'
  const path = document.createElementNS(ns, 'path')
  path.setAttribute('d', d)
  try {
    const len = path.getTotalLength()
    const p = path.getPointAtLength(len / 2)
    return { x: p.x, y: p.y }
  } catch {
    return { x: 0, y: 0 }
  }
}

function findSnap(
  cx: number,
  cy: number,
  blocks: Block[],
  excludeId: string,
  threshold: number
): { blockId: string; anchor: 'top' | 'right' | 'bottom' | 'left' | 'center' } | null {
  let best: { d: number; ret: any } | null = null
  for (const b of blocks) {
    if (b.id === excludeId || b.type === 'connector') continue
    const { x, y, w, h } = b.bounds
    const candidates: Array<[string, Point]> = [
      ['top',    { x: x + w / 2, y }],
      ['right',  { x: x + w, y: y + h / 2 }],
      ['bottom', { x: x + w / 2, y: y + h }],
      ['left',   { x, y: y + h / 2 }],
      ['center', { x: x + w / 2, y: y + h / 2 }],
    ]
    for (const [name, p] of candidates) {
      const d = Math.hypot(p.x - cx, p.y - cy)
      if (d < threshold && (!best || d < best.d)) {
        best = { d, ret: { blockId: b.id, anchor: name } }
      }
    }
  }
  return best?.ret || null
}

const colorCache = new Map<string, string>()
function resolveCssColor(value: string): string {
  if (typeof document === 'undefined') return value
  const v = value.trim()
  if (!v.startsWith('var(')) return v
  if (colorCache.has(v)) return colorCache.get(v)!
  const m = v.match(/var\(\s*(--[^,)]+)/)
  if (!m) return v
  const cs = getComputedStyle(document.documentElement)
  const got = cs.getPropertyValue(m[1].trim()).trim()
  if (got) {
    // Cache only for the lifetime of the current frame (theme changes are rare)
    colorCache.set(v, got)
    return got
  }
  return v
}

