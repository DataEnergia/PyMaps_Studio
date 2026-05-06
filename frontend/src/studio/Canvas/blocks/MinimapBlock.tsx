import type { Block, MinimapBlockConfig } from '../../types'

interface Props {
  block: Block
  isSelected: boolean
}

export default function MinimapBlock({ block, isSelected }: Props) {
  const config = (block.config || {}) as unknown as MinimapBlockConfig

  return (
    <div
      className="w-full h-full rounded-lg overflow-hidden relative"
      style={{
        background: 'radial-gradient(ellipse at 30% 40%, rgba(76,134,184,0.12), transparent 60%), #15202b',
        outline: isSelected ? '2px solid var(--accent)' : undefined,
        outlineOffset: -2,
      }}
    >
      {/* Brasil shape */}
      <div
        style={{
          position: 'absolute',
          left: '20%',
          top: '18%',
          width: '58%',
          height: '64%',
          background: 'rgba(76,134,184,0.1)',
          border: '1px solid rgba(76,134,184,0.25)',
          borderRadius: '12% 20% 28% 8% / 8% 18% 22% 14%',
        }}
      />

      {/* Highlight position marker */}
      {config.highlightPosition && (
        <div
          style={{
            position: 'absolute',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--warning)',
            boxShadow: '0 0 10px var(--warning)',
            left: `${30 + Math.random() * 20}%`,
            top: `${40 + Math.random() * 20}%`,
          }}
        />
      )}

      {/* Labels */}
      {config.label && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 10,
            fontSize: 8,
            color: 'rgba(255,255,255,0.45)',
            fontFamily: 'var(--font-condensed)',
          }}
        >
          {config.label}
        </div>
      )}

      {config.highlightLabel && (
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            right: 10,
            fontSize: 8,
            color: 'rgba(255,255,255,0.5)',
          }}
        >
          {config.highlightLabel}
        </div>
      )}

      {/* Compass */}
      <div
        style={{
          position: 'absolute',
          bottom: 6,
          left: 6,
          width: 22,
          height: 22,
          borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 8,
          color: 'rgba(255,255,255,0.35)',
        }}
      >
        N
      </div>
    </div>
  )
}
