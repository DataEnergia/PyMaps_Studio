import type { Block, TimelineBlockConfig } from '../../types'

interface Props {
  block: Block
  isSelected: boolean
}

export default function TimelineBlock({ block, isSelected }: Props) {
  const config = (block.config || {}) as unknown as TimelineBlockConfig
  const events = config.events || []
  const isVertical = config.orientation === 'vertical'

  return (
    <div
      className="w-full h-full flex flex-col rounded-lg overflow-hidden"
      style={{
        padding: '14px 18px',
        background: 'var(--surface-strong)',
        outline: isSelected ? '2px solid var(--accent)' : undefined,
        outlineOffset: -2,
      }}
    >
      {config.title && (
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text)',
            textTransform: 'uppercase',
            letterSpacing: '0.8px',
            marginBottom: 8,
          }}
        >
          {config.title}
        </div>
      )}

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: isVertical ? 'column' : 'row',
          alignItems: isVertical ? 'flex-start' : 'flex-start',
          gap: isVertical ? 12 : 0,
          position: 'relative',
          padding: isVertical ? '0 0 0 20px' : '20px 0 0 0',
        }}
      >
        {/* Track line */}
        <div
          style={{
            position: 'absolute',
            background: 'linear-gradient(to right, var(--accent-soft), var(--accent), var(--accent-soft))',
            ...(isVertical
              ? { left: 8, top: 16, bottom: 16, width: 2 }
              : { top: 14, left: 14, right: 14, height: 2 }),
            borderRadius: 1,
          }}
        />

        {events.map((ev, i) => (
          <div
            key={i}
            style={{
              flex: isVertical ? undefined : 1,
              display: 'flex',
              flexDirection: isVertical ? 'row' : 'column',
              alignItems: isVertical ? 'center' : 'center',
              gap: isVertical ? 10 : 6,
              position: 'relative',
              zIndex: 1,
            }}
          >
            {/* Dot */}
            <div
              style={{
                width: isVertical ? 12 : 14,
                height: isVertical ? 12 : 14,
                borderRadius: '50%',
                background: ev.color || 'var(--accent)',
                border: '3px solid var(--surface-strong)',
                boxShadow: `0 0 0 2px ${ev.color || 'var(--accent)'}`,
                flexShrink: 0,
              }}
            />

            {/* Label group */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
                textAlign: 'center',
              }}
            >
              {config.showValues !== false && ev.value && (
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)', fontFamily: 'var(--font-condensed)' }}>
                  {ev.value}
                </span>
              )}
              <span style={{ fontSize: 10, color: 'var(--text-subtle)', fontWeight: 500 }}>
                {ev.date}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text)', fontWeight: 600 }}>
                {ev.title}
              </span>
              {ev.subtitle && (
                <span style={{ fontSize: 9, color: 'var(--text-subtle)' }}>
                  {ev.subtitle}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
