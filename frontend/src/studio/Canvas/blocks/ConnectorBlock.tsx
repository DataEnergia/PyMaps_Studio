/**
 * ConnectorBlock — public API for connector path/marker rendering.
 *
 * Connectors are NOT rendered through BlockRenderer (which clips to bounds).
 * They are drawn at canvas-absolute coordinates by `ConnectorsLayer`
 * (in InfographicCanvas). This file exposes the geometry helpers and the
 * marker library used both by the canvas layer and the SVG exporter, so
 * the on-screen render and the exported SVG are pixel-identical.
 */
import type { Block, ConnectorBlockConfig, MarkerType } from '../../types'

export type Point = { x: number; y: number }

/* ── Endpoint resolution ───────────────────────────────────────────── */

export function getAnchorPoint(
  block: Block | undefined,
  anchor: ConnectorBlockConfig['fromAnchor'],
  fallback: Point
): Point {
  if (!anchor) return fallback
  if (anchor.x !== undefined && anchor.y !== undefined && !anchor.blockId) {
    return { x: anchor.x, y: anchor.y }
  }
  if (anchor.blockId && block) {
    const { x, y, w, h } = block.bounds
    switch (anchor.anchor || 'center') {
      case 'top':    return { x: x + w / 2, y }
      case 'bottom': return { x: x + w / 2, y: y + h }
      case 'left':   return { x, y: y + h / 2 }
      case 'right':  return { x: x + w, y: y + h / 2 }
      default:       return { x: x + w / 2, y: y + h / 2 }
    }
  }
  return fallback
}

/* ── Path geometry ─────────────────────────────────────────────────── */

export function buildPathD(from: Point, to: Point, style: string, curvature: number, bow: number): string {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const dist = Math.hypot(dx, dy)
  if (dist < 1) return `M${from.x},${from.y} L${to.x},${to.y}`

  if (style === 'straight') {
    return `M${from.x},${from.y} L${to.x},${to.y}`
  }

  if (style === 'orthogonal') {
    const midX = (from.x + to.x) / 2
    return `M${from.x},${from.y} L${midX},${from.y} L${midX},${to.y} L${to.x},${to.y}`
  }

  if (style === 'arc') {
    // Single-arc semicircle bulging perpendicularly
    const r = dist / 2
    const sweep = bow >= 0 ? 1 : 0
    return `M${from.x},${from.y} A${r},${r} 0 0 ${sweep} ${to.x},${to.y}`
  }

  if (style === 'sCurve') {
    // Two opposite Bézier handles, perpendicular offset = `bow`
    const nx = -dy / dist
    const ny = dx / dist
    const offset = bow * dist * 0.4
    const cp1 = { x: from.x + dx / 3 + nx * offset, y: from.y + dy / 3 + ny * offset }
    const cp2 = { x: to.x - dx / 3 - nx * offset, y: to.y - dy / 3 - ny * offset }
    return `M${from.x},${from.y} C${cp1.x},${cp1.y} ${cp2.x},${cp2.y} ${to.x},${to.y}`
  }

  // Default: 'curved' — smooth Bézier with curvature in the dominant direction
  const c = Math.max(0.1, Math.min(0.9, curvature))
  if (Math.abs(dy) > Math.abs(dx) * 1.1) {
    // Vertical-dominant: handles go vertically
    const cy1 = from.y + dy * c
    const cy2 = to.y - dy * c
    return `M${from.x},${from.y} C${from.x},${cy1} ${to.x},${cy2} ${to.x},${to.y}`
  }
  // Horizontal-dominant: handles go horizontally
  const cx1 = from.x + dx * c
  const cx2 = to.x - dx * c
  return `M${from.x},${from.y} C${cx1},${from.y} ${cx2},${to.y} ${to.x},${to.y}`
}

/* ── Marker library ────────────────────────────────────────────────── */

interface MarkerSpec {
  /** SVG viewBox extents (we always use 0 0 vbW vbH). */
  vbW: number
  vbH: number
  /** Point of attachment: where the line tip should land. */
  refX: number
  refY: number
  /** Inner SVG content (paths/shapes). */
  body: (color: string) => string
}

export const MARKER_SPECS: Record<MarkerType, MarkerSpec | null> = {
  none: null,
  arrow: {
    vbW: 10, vbH: 10, refX: 9.5, refY: 5,
    body: (c) => `<path d="M0,0 L10,5 L0,10 Z" fill="${c}"/>`,
  },
  arrowOpen: {
    vbW: 10, vbH: 10, refX: 9.5, refY: 5,
    body: (c) => `<path d="M0,0 L10,5 L0,10" fill="none" stroke="${c}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>`,
  },
  arrowConcave: {
    vbW: 12, vbH: 10, refX: 11.5, refY: 5,
    body: (c) => `<path d="M0,0 L12,5 L0,10 L4,5 Z" fill="${c}"/>`,
  },
  triangle: {
    vbW: 10, vbH: 10, refX: 9.5, refY: 5,
    body: (c) => `<path d="M1,1 L9.5,5 L1,9 Z" fill="${c}" stroke="${c}" stroke-width="0.8" stroke-linejoin="round"/>`,
  },
  circle: {
    vbW: 8, vbH: 8, refX: 4, refY: 4,
    body: (c) => `<circle cx="4" cy="4" r="3" fill="${c}"/>`,
  },
  circleOpen: {
    vbW: 8, vbH: 8, refX: 4, refY: 4,
    body: (c) => `<circle cx="4" cy="4" r="2.6" fill="none" stroke="${c}" stroke-width="1.4"/>`,
  },
  square: {
    vbW: 8, vbH: 8, refX: 4, refY: 4,
    body: (c) => `<rect x="0.8" y="0.8" width="6.4" height="6.4" fill="${c}"/>`,
  },
  diamond: {
    vbW: 10, vbH: 10, refX: 5, refY: 5,
    body: (c) => `<path d="M5,0 L10,5 L5,10 L0,5 Z" fill="${c}"/>`,
  },
  bar: {
    vbW: 4, vbH: 10, refX: 2, refY: 5,
    body: (c) => `<rect x="0.4" y="1" width="3.2" height="8" rx="0.8" fill="${c}"/>`,
  },
  dot: {
    vbW: 6, vbH: 6, refX: 3, refY: 3,
    body: (c) => `<circle cx="3" cy="3" r="2" fill="${c}"/>`,
  },
}

export function buildMarkerSVG(id: string, type: MarkerType, color: string, scale = 1): string {
  const spec = MARKER_SPECS[type]
  if (!spec) return ''
  const w = spec.vbW * scale * 0.8
  const h = spec.vbH * scale * 0.8
  return `<marker id="${id}" markerUnits="strokeWidth" markerWidth="${w.toFixed(2)}" markerHeight="${h.toFixed(2)}" viewBox="0 0 ${spec.vbW} ${spec.vbH}" refX="${spec.refX}" refY="${spec.refY}" orient="auto-start-reverse">${spec.body(color)}</marker>`
}

/* ── Default placeholder export (block file expected by BlockRenderer) ── */
/* Connectors are not rendered through BlockRenderer; this returns null
 * to make the block-content-wrap inert. The actual rendering happens in
 * `ConnectorsLayer` (InfographicCanvas). */
export default function ConnectorBlock(): null {
  return null
}
