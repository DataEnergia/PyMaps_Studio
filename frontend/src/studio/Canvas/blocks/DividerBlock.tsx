import type { Block, DividerBlockConfig } from '../../types'

interface Props {
  block: Block
  isSelected: boolean
}

export default function DividerBlock({ block, isSelected }: Props) {
  const config = (block.config || {}) as unknown as DividerBlockConfig
  const isVertical = config.orientation === 'vertical'
  const lineColor = config.color || 'var(--border)'
  const thickness = config.thickness || 1.5

  const dashPattern =
    config.style === 'dashed' ? '8 5' :
    config.style === 'dotted' ? '2 4' :
    undefined

  const label = config.label

  const wrapperStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    outline: isSelected ? '2px solid var(--accent)' : undefined,
    outlineOffset: -2,
    boxSizing: 'border-box',
  }

  const lineBase: React.CSSProperties = {
    background: dashPattern ? 'transparent' : lineColor,
    opacity: dashPattern ? 1 : 0.35,
    ...(isVertical
      ? { width: thickness, height: '100%' }
      : { width: '100%', height: thickness }
    ),
    borderRadius: thickness / 2,
  }

  if (dashPattern) {
    if (isVertical) {
      return (
        <div style={wrapperStyle}>
          <svg width={thickness} height="100%" style={{ overflow: 'visible' }}>
            <line x1={thickness / 2} y1={0} x2={thickness / 2} y2="100%"
              stroke={lineColor} strokeWidth={thickness} strokeDasharray={dashPattern} opacity={0.5} />
          </svg>
          {label && (
            <span style={{
              position: 'absolute',
              writingMode: 'vertical-rl',
              fontSize: 9,
              color: 'var(--text-subtle)',
              letterSpacing: 1,
              textTransform: 'uppercase',
              background: 'rgba(15,25,40,0.85)',
              padding: '4px 1px',
              borderRadius: 3,
            }}>{label}</span>
          )}
        </div>
      )
    }

    return (
      <div style={wrapperStyle}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
          <svg width="100%" height={Math.max(thickness, 2)} preserveAspectRatio="none">
            <line x1={0} y1={thickness / 2} x2="100%" y2={thickness / 2}
              stroke={lineColor} strokeWidth={thickness} strokeDasharray={dashPattern} opacity={0.5} />
          </svg>
        </div>
        {label && (
          <>
            <span style={{
              fontSize: 9,
              color: 'var(--text-subtle)',
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              margin: '0 10px',
              whiteSpace: 'nowrap',
              background: 'rgba(15,25,40,0.85)',
              padding: '2px 8px',
              borderRadius: 3,
              fontWeight: 500,
            }}>{label}</span>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}>
              <svg width="100%" height={Math.max(thickness, 2)} preserveAspectRatio="none">
                <line x1={0} y1={thickness / 2} x2="100%" y2={thickness / 2}
                  stroke={lineColor} strokeWidth={thickness} strokeDasharray={dashPattern} opacity={0.5} />
              </svg>
            </div>
          </>
        )}
      </div>
    )
  }

  // Solid line
  if (label) {
    return (
      <div style={wrapperStyle}>
        <div style={{ flex: 1, ...lineBase }} />
        <span style={{
          fontSize: 9,
          color: 'var(--text-subtle)',
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          margin: '0 10px',
          whiteSpace: 'nowrap',
          background: 'rgba(15,25,40,0.85)',
          padding: '2px 8px',
          borderRadius: 3,
          fontWeight: 500,
        }}>{label}</span>
        <div style={{ flex: 1, ...lineBase }} />
      </div>
    )
  }

  return (
    <div style={wrapperStyle}>
      <div style={lineBase} />
    </div>
  )
}
