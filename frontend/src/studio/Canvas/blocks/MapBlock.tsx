import type { Block, MapBlockConfig } from '../../types'
import { getIconByName } from '../../../lib/mapIcons'

const BASE_STYLES: Record<string, string> = {
  none: '',
  road: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  terrain: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  satellite: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
}

const MARKER_COLORS: Record<string, string> = {
  '#E53935': '#ef4444',
  '#D32F2F': '#dc2626',
  '#C62828': '#b91c1c',
  '#B71C1C': '#991b1b',
}

export function getBaseMapStyle(basemap: string): string {
  return BASE_STYLES[basemap] || ''
}

export function getMarkerCSS(color?: string): string {
  const c = color || '#E53935'
  return MARKER_COLORS[c] || c
}

interface Props {
  block: Block
  isSelected: boolean
  onClick: () => void
}

const mapStyles: Record<string, { bg: string; grid: string; label: string; shape: string }> = {
  dark: {
    bg: 'linear-gradient(160deg, #1a2a3a 0%, #0d1b2a 40%, #1b2838 70%, #0f1c2c 100%)',
    grid: 'rgba(255,255,255,0.04)',
    label: 'rgba(255,255,255,0.5)',
    shape: 'rgba(76,134,184,0.15)',
  },
  light: {
    bg: 'linear-gradient(160deg, #e8ecf0 0%, #dce1e6 40%, #eef1f4 70%, #d8dde2 100%)',
    grid: 'rgba(0,0,0,0.06)',
    label: 'rgba(0,0,0,0.4)',
    shape: 'rgba(31,79,122,0.08)',
  },
}

export default function MapBlock({ block, isSelected }: Props) {
  const config = (block.config || {}) as unknown as MapBlockConfig
  const style = mapStyles[(config as any).style || 'dark'] || mapStyles.dark
  const area = config.area || { type: 'brasil', nome: 'Brasil' }
  const markers = config.markers || []

  return (
    <div
      className="w-full h-full relative overflow-hidden rounded-lg"
      style={{
        background: style.bg,
        outline: isSelected ? '2px solid var(--accent)' : undefined,
        outlineOffset: -2,
      }}
    >
      {/* Grid lines */}
      {[20, 40, 60, 80].map((pct) => (
        <div
          key={`h-${pct}`}
          style={{
            position: 'absolute',
            top: `${pct}%`,
            left: 0,
            right: 0,
            height: 1,
            background: style.grid,
          }}
        />
      ))}
      {[20, 40, 60, 80].map((pct) => (
        <div
          key={`v-${pct}`}
          style={{
            position: 'absolute',
            left: `${pct}%`,
            top: 0,
            bottom: 0,
            width: 1,
            background: style.grid,
          }}
        />
      ))}

      {/* Area shape */}
      <div
        style={{
          position: 'absolute',
          left: '25%',
          top: '15%',
          width: '50%',
          height: '70%',
          background: style.shape,
          border: `1.5px solid ${style.shape}`,
          borderRadius: '15% 20% 30% 10% / 10% 20% 15% 25%',
        }}
      />

      {/* Markers */}
      {markers.map((m, i) => {
        const iconSvg = m.icon
          ? (m.icon.startsWith('<svg') ? m.icon : getIconByName(m.icon)?.svg)
          : (config.markerIcon
              ? (config.markerIcon.startsWith('<svg') ? config.markerIcon : getIconByName(config.markerIcon)?.svg)
              : null)
        const color = config.markerIconColor || m.color || config.markerColor || '#E53935'
        const size = Math.max(4, m.size || config.markerSize || 8)
        const strokeW = config.markerStrokeWidth ?? 0.8
        const strokeC = config.markerStrokeColor || '#ffffff'
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              width: size,
              height: size,
              borderRadius: iconSvg ? undefined : '50%',
              background: iconSvg ? undefined : color,
              boxShadow: iconSvg ? undefined : `0 0 0 ${strokeW}px ${strokeC}`,
              color,
              left: `${25 + Math.random() * 40}%`,
              top: `${15 + Math.random() * 60}%`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {iconSvg ? (
              <div style={{ width: '100%', height: '100%', filter: strokeW > 0 ? `drop-shadow(0 0 ${strokeW}px ${strokeC})` : undefined }} dangerouslySetInnerHTML={{ __html: iconSvg }} />
            ) : (
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%,-50%)',
                  width: 4,
                  height: 4,
                  borderRadius: '50%',
                  background: '#fff',
                }}
              />
            )}
          </div>
        )
      })}

      {/* Labels */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 12,
          fontSize: 10,
          color: style.label,
          fontFamily: 'var(--font-condensed)',
          fontWeight: 500,
        }}
      >
        {area.nome || area.type}
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 8,
          left: 12,
          fontSize: 9,
          color: style.label,
        }}
      >
        {markers.length} marcadores
      </div>
    </div>
  )
}
