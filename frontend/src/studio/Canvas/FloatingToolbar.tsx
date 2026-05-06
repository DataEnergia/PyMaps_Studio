/**
 * FloatingToolbar — reusable Canva-style toolbar that floats above the
 * currently selected block. Hosts the common controls (color, font, etc.).
 *
 * Each block (Card, Shape, Table) decides which children to render and
 * the toolbar handles positioning + portal + click-isolation.
 */
import { useEffect, useState, useRef } from 'react'
import ReactDOM from 'react-dom'

interface Props {
  visible: boolean
  containerRef: React.RefObject<HTMLElement>
  children: React.ReactNode
  /** Vertical offset above the container (default 52). */
  offset?: number
}

export default function FloatingToolbar({ visible, containerRef, children, offset = 52 }: Props) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useEffect(() => {
    if (!visible || !containerRef.current) { setPos(null); return }
    const update = () => {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      setPos({ top: rect.top - offset, left: rect.left + rect.width / 2 })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    /* Re-position when bounds change (drag/resize) */
    const ro = new ResizeObserver(update)
    if (containerRef.current) ro.observe(containerRef.current)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      ro.disconnect()
    }
  }, [visible, containerRef, offset])

  if (!visible || !pos) return null

  return ReactDOM.createPortal(
    <div
      className="hide-on-export"
      data-text-toolbar="true"
      style={{
        position: 'fixed',
        top: Math.max(8, pos.top),
        left: pos.left,
        transform: 'translateX(-50%)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        background: 'rgba(24,24,27,0.97)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 10,
        padding: '4px 6px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.60), 0 0 0 1px rgba(0,0,0,0.30)',
        backdropFilter: 'blur(16px)',
        pointerEvents: 'auto',
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body,
  )
}

/* ── Common atoms used by floating toolbars ───────────────────────── */

export const TB_PALETTE = [
  '#ffffff', '#f4f4f5', '#a1a1aa', '#52525b', '#09090b',
  '#2563eb', '#0284c7', '#06b6d4', '#10b981', '#84cc16',
  '#f59e0b', '#f97316', '#dc2626', '#e11d48', '#ec4899',
  '#a855f7', '#7c3aed', '#4338ca', '#1e3a8a', '#000000',
]

export function TbButton({
  active, onClick, title, children,
}: { active?: boolean; onClick?: () => void; title?: string; children: React.ReactNode }) {
  return (
    <button
      style={{
        width: 30, height: 30, borderRadius: 6, border: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer',
        background: active ? 'rgba(255,255,255,0.16)' : 'transparent',
        color: active ? '#fff' : 'rgba(255,255,255,0.7)',
        transition: 'background 0.08s',
        flexShrink: 0,
      }}
      onMouseDown={(e) => { e.preventDefault(); onClick?.() }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}
      title={title}
    >
      {children}
    </button>
  )
}

export function TbGroup({ children, last = false }: { children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 2,
      padding: '0 5px',
      borderRight: last ? 'none' : '1px solid rgba(255,255,255,0.08)',
    }}>
      {children}
    </div>
  )
}

export function TbColorSwatch({
  value, onChange, title,
}: { value: string; onChange: (c: string) => void; title?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const display = value && value !== 'transparent' && (value.startsWith('#') || value.startsWith('rgb'))
    ? value : '#2563eb'

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        style={{
          width: 30, height: 30, borderRadius: 6, border: 'none',
          background: 'transparent', display: 'flex', alignItems: 'center',
          justifyContent: 'center', cursor: 'pointer',
        }}
        onMouseDown={(e) => { e.preventDefault(); setOpen((s) => !s) }}
        title={title}
      >
        <span style={{
          width: 18, height: 18, borderRadius: 4, display: 'block',
          background: display,
          border: '1.5px solid rgba(255,255,255,0.30)',
          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.25)',
        }} />
      </button>
      {open && (
        <div
          data-text-toolbar="true"
          style={{
            position: 'absolute', top: 38, left: -90, zIndex: 100000,
            background: 'rgba(24,24,27,0.97)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10, padding: 8,
            boxShadow: '0 8px 32px rgba(0,0,0,0.60)',
            backdropFilter: 'blur(16px)',
            display: 'grid', gridTemplateColumns: 'repeat(5, 22px)', gap: 5,
            width: 'max-content',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {TB_PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => { onChange(c); setOpen(false) }}
              style={{
                width: 22, height: 22, borderRadius: 4, padding: 0, cursor: 'pointer',
                background: c,
                border: value === c ? '2px solid #fff' : '1px solid rgba(255,255,255,0.12)',
              }}
            />
          ))}
          <input
            type="color"
            value={display}
            onChange={(e) => onChange(e.target.value)}
            style={{
              width: '100%', gridColumn: 'span 5', height: 22,
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 4, background: 'rgba(255,255,255,0.04)',
              cursor: 'pointer', padding: 0,
            }}
          />
        </div>
      )}
    </div>
  )
}
