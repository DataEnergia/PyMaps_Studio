import { useState, useRef, useEffect } from 'react'
import ReactDOM from 'react-dom'

/**
 * 12 hues × 11 shades — light (top) to dark (bottom).
 * Columns: Slate · Red · Orange · Amber · Lime · Green · Teal · Sky · Blue · Violet · Pink · Zinc
 */
const PALETTE_COLS: string[][] = [
  ['#f8fafc','#f1f5f9','#e2e8f0','#cbd5e1','#94a3b8','#64748b','#475569','#334155','#1e293b','#0f172a','#020617'],
  ['#fef2f2','#fee2e2','#fecaca','#fca5a5','#f87171','#ef4444','#dc2626','#b91c1c','#991b1b','#7f1d1d','#450a0a'],
  ['#fff7ed','#ffedd5','#fed7aa','#fdba74','#fb923c','#f97316','#ea580c','#c2410c','#9a3412','#7c2d12','#431407'],
  ['#fffbeb','#fef3c7','#fde68a','#fcd34d','#fbbf24','#f59e0b','#d97706','#b45309','#92400e','#78350f','#451a03'],
  ['#f7fee7','#ecfccb','#d9f99d','#bef264','#a3e635','#84cc16','#65a30d','#4d7c0f','#3f6212','#365314','#1a2e05'],
  ['#f0fdf4','#dcfce7','#bbf7d0','#86efac','#4ade80','#22c55e','#16a34a','#15803d','#166534','#14532d','#052e16'],
  ['#f0fdfa','#ccfbf1','#99f6e4','#5eead4','#2dd4bf','#14b8a6','#0d9488','#0f766e','#115e59','#134e4a','#042f2e'],
  ['#f0f9ff','#e0f2fe','#bae6fd','#7dd3fc','#38bdf8','#0ea5e9','#0284c7','#0369a1','#075985','#0c4a6e','#082f49'],
  ['#eff6ff','#dbeafe','#bfdbfe','#93c5fd','#60a5fa','#3b82f6','#2563eb','#1d4ed8','#1e40af','#1e3a8a','#172554'],
  ['#f5f3ff','#ede9fe','#ddd6fe','#c4b5fd','#a78bfa','#8b5cf6','#7c3aed','#6d28d9','#5b21b6','#4c1d95','#2e1065'],
  ['#fdf2f8','#fce7f3','#fbcfe8','#f9a8d4','#f472b6','#ec4899','#db2777','#be185d','#9d174d','#831843','#500724'],
  ['#fafafa','#f4f4f5','#e4e4e7','#d4d4d8','#a1a1aa','#71717a','#52525b','#3f3f46','#27272a','#18181b','#09090b'],
]

// Flatten row-first: each row = one shade level across all 12 hues
const FLAT_PALETTE: string[] = []
for (let shade = 0; shade < 11; shade++) {
  for (let hue = 0; hue < 12; hue++) {
    FLAT_PALETTE.push(PALETTE_COLS[hue][shade])
  }
}

interface Props {
  value: string
  onChange: (color: string) => void
  allowTransparent?: boolean
}

export default function ColorPicker({ value, onChange, allowTransparent = false }: Props) {
  const [open, setOpen] = useState(false)
  const [hex, setHex] = useState(value || '')
  const [popPos, setPopPos] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setHex(value || '') }, [value])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !popoverRef.current?.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const isTransparent = !value || value === 'transparent'
  const displayColor = !isTransparent && (value.startsWith('#') || value.startsWith('rgb'))
    ? value : '#000000'

  const computePos = () => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const popH = 310
    const popW = 236
    let top = rect.bottom + 6
    let left = rect.left
    if (top + popH > window.innerHeight - 8) top = rect.top - popH - 6
    if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8
    if (left < 8) left = 8
    setPopPos({ top, left })
  }

  const handleToggle = () => {
    if (!open) computePos()
    setOpen((s) => !s)
  }

  const commitHex = (v: string) => {
    setHex(v)
    if (
      v === 'transparent' ||
      v.match(/^#[0-9a-fA-F]{3}$/) ||
      v.match(/^#[0-9a-fA-F]{6}$/) ||
      v.startsWith('rgb')
    ) onChange(v)
  }

  const pick = (color: string) => {
    onChange(color)
    setHex(color)
    setOpen(false)
  }

  const currentNorm = value?.toLowerCase() ?? ''

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, position: 'relative' }}>
      {/* Color swatch trigger */}
      <button
        ref={triggerRef}
        onClick={handleToggle}
        title="Escolher cor"
        style={{
          width: 28, height: 28, borderRadius: 7, cursor: 'pointer', flexShrink: 0,
          border: open ? '2px solid var(--accent)' : '1.5px solid var(--border)',
          background: isTransparent
            ? 'repeating-conic-gradient(#ccc 0% 25%, #f8f8f8 0% 50%) center/10px 10px'
            : displayColor,
          transition: 'border-color 0.1s',
        }}
      />

      {/* Hex input */}
      <input
        type="text"
        value={hex}
        onChange={(e) => commitHex(e.target.value)}
        placeholder={allowTransparent ? 'transparent' : '#000000'}
        style={{
          width: 84, fontSize: 11, fontFamily: 'monospace',
          padding: '4px 7px', borderRadius: 6,
          background: 'var(--surface-muted)',
          border: '1px solid var(--border)',
          color: 'var(--text)', outline: 'none',
          transition: 'border-color 0.1s',
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
      />

      {/* Palette popover — portal so it escapes overflow:hidden panels */}
      {open && popPos && ReactDOM.createPortal(
        <div
          ref={popoverRef}
          style={{
            position: 'fixed',
            top: popPos.top,
            left: popPos.left,
            zIndex: 999999,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 10,
            boxShadow: 'var(--panel-shadow)',
            width: 236,
            userSelect: 'none',
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Grid: 12 cols × 11 rows */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(12, 1fr)',
              gap: 3,
              marginBottom: 10,
            }}
          >
            {FLAT_PALETTE.map((color, i) => {
              const active = currentNorm === color.toLowerCase()
              return (
                <button
                  key={i}
                  onClick={() => pick(color)}
                  title={color}
                  style={{
                    width: '100%',
                    aspectRatio: '1',
                    borderRadius: 3,
                    cursor: 'pointer',
                    background: color,
                    border: active
                      ? '2px solid var(--text)'
                      : '1px solid rgba(0,0,0,0.07)',
                    position: 'relative',
                    transition: 'transform 0.08s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'scale(1.25)'
                    e.currentTarget.style.zIndex = '2'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'scale(1)'
                    e.currentTarget.style.zIndex = 'auto'
                  }}
                />
              )
            })}
          </div>

          {/* Divider */}
          <div style={{ height: 1, background: 'var(--border)', marginBottom: 10 }} />

          {/* Custom picker row */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <input
                type="color"
                value={displayColor}
                onChange={(e) => { onChange(e.target.value); setHex(e.target.value) }}
                title="Personalizado"
                style={{
                  width: 30, height: 30, borderRadius: 7, cursor: 'pointer',
                  border: '1.5px solid var(--border)', padding: 2,
                  background: 'var(--surface-muted)',
                }}
              />
            </div>
            <input
              type="text"
              value={hex}
              onChange={(e) => commitHex(e.target.value)}
              placeholder="#rrggbb"
              style={{
                flex: 1, fontSize: 11, fontFamily: 'monospace',
                padding: '5px 8px', borderRadius: 6,
                background: 'var(--surface-muted)',
                border: '1px solid var(--border)',
                color: 'var(--text)', outline: 'none',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}
            />
            {allowTransparent && (
              <button
                onClick={() => pick('transparent')}
                style={{
                  fontSize: 10, padding: '5px 7px', borderRadius: 6, cursor: 'pointer',
                  background: isTransparent ? 'var(--accent-soft)' : 'var(--surface-muted)',
                  border: `1px solid ${isTransparent ? 'var(--accent)' : 'var(--border)'}`,
                  color: isTransparent ? 'var(--accent)' : 'var(--text-muted)',
                  whiteSpace: 'nowrap', flexShrink: 0,
                  transition: 'background 0.1s',
                }}
              >
                Transp.
              </button>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
