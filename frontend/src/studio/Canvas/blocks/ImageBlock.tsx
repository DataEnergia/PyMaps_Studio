import { useRef } from 'react'
import { Upload } from 'lucide-react'
import { useStudioStore } from '../../store/studioStore'
import type { Block, ImageBlockConfig, ImageMaskShape } from '../../types'

interface Props {
  block: Block
  isSelected: boolean
}

/* ── SVG mask path generator (used both on screen and in export) ── */
export function maskPathFor(shape: ImageMaskShape, w: number, h: number): string {
  switch (shape) {
    case 'circle': {
      const r = Math.min(w, h) / 2
      const cx = w / 2, cy = h / 2
      return `M ${cx - r},${cy} A ${r},${r} 0 1,0 ${cx + r},${cy} A ${r},${r} 0 1,0 ${cx - r},${cy} Z`
    }
    case 'squircle': {
      // Smooth super-ellipse via cubic approximation
      const rx = w / 2, ry = h / 2
      return `M 0,${ry} C 0,${ry * 0.07} ${rx * 0.07},0 ${rx},0 C ${rx + rx * 0.93},0 ${w},${ry * 0.07} ${w},${ry} C ${w},${ry + ry * 0.93} ${rx + rx * 0.93},${h} ${rx},${h} C ${rx * 0.07},${h} 0,${ry + ry * 0.93} 0,${ry} Z`
    }
    case 'hexagon': {
      const cx = w / 2, cy = h / 2
      const rx = w / 2, ry = h / 2
      // Pointy-top hexagon stretched to fit
      const points: [number, number][] = [
        [cx, cy - ry],
        [cx + rx * 0.866, cy - ry * 0.5],
        [cx + rx * 0.866, cy + ry * 0.5],
        [cx, cy + ry],
        [cx - rx * 0.866, cy + ry * 0.5],
        [cx - rx * 0.866, cy - ry * 0.5],
      ]
      return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x},${y}`).join(' ') + ' Z'
    }
    case 'rhombus': {
      const cx = w / 2, cy = h / 2
      return `M ${cx},0 L ${w},${cy} L ${cx},${h} L 0,${cy} Z`
    }
    case 'star': {
      const cx = w / 2, cy = h / 2
      const rOuter = Math.min(w, h) / 2
      const rInner = rOuter * 0.42
      const pts: [number, number][] = []
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5
        const r = i % 2 === 0 ? rOuter : rInner
        pts.push([cx + Math.cos(a) * r * (w / Math.min(w, h)), cy + Math.sin(a) * r * (h / Math.min(w, h))])
      }
      return pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x},${y}`).join(' ') + ' Z'
    }
    case 'blob': {
      // Asymmetric organic shape (deterministic)
      const cx = w / 2, cy = h / 2
      const rx = w / 2 * 0.92, ry = h / 2 * 0.92
      return `M ${cx - rx * 0.6},${cy - ry * 0.85}
        C ${cx + rx * 0.3},${cy - ry * 1.05} ${cx + rx * 1.05},${cy - ry * 0.45} ${cx + rx * 0.95},${cy + ry * 0.18}
        C ${cx + rx * 0.85},${cy + ry * 0.95} ${cx - rx * 0.05},${cy + ry * 1.0} ${cx - rx * 0.7},${cy + ry * 0.65}
        C ${cx - rx * 1.05},${cy + ry * 0.2} ${cx - rx * 0.95},${cy - ry * 0.5} ${cx - rx * 0.6},${cy - ry * 0.85} Z`
    }
    case 'rounded': {
      // Strong rounded rect
      const r = Math.min(w, h) * 0.12
      return `M ${r},0 L ${w - r},0 Q ${w},0 ${w},${r} L ${w},${h - r} Q ${w},${h} ${w - r},${h} L ${r},${h} Q 0,${h} 0,${h - r} L 0,${r} Q 0,0 ${r},0 Z`
    }
    case 'none':
    default:
      return `M 0,0 L ${w},0 L ${w},${h} L 0,${h} Z`
  }
}

export default function ImageBlock({ block, isSelected }: Props) {
  const cfg = (block.config || {}) as ImageBlockConfig
  const { patchBlockConfig } = useStudioStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fit = cfg.fit || 'cover'
  const radius = cfg.borderRadius ?? 0
  const mask = cfg.mask || 'none'
  const brightness = cfg.brightness ?? 100
  const contrast = cfg.contrast ?? 100
  const saturation = cfg.saturation ?? 100
  const grayscale = cfg.grayscale ?? 0
  const blur = cfg.blur ?? 0
  const borderColor = cfg.borderColor
  const borderWidth = cfg.borderWidth ?? 0
  const shadow = cfg.shadow

  const filterStr = [
    `brightness(${brightness}%)`,
    `contrast(${contrast}%)`,
    `saturate(${saturation}%)`,
    grayscale ? `grayscale(${grayscale}%)` : '',
    blur ? `blur(${blur}px)` : '',
  ].filter(Boolean).join(' ')

  const onUpload = (file: File) => {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => {
      patchBlockConfig(block.id, { src: String(reader.result) })
    }
    reader.readAsDataURL(file)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) onUpload(file)
  }

  const renderImg = (w: number, h: number) => {
    if (mask === 'none') {
      return (
        <img
          src={cfg.src}
          alt={cfg.alt || ''}
          style={{
            width: '100%',
            height: '100%',
            objectFit: fit,
            borderRadius: radius,
            filter: filterStr,
            display: 'block',
          }}
        />
      )
    }
    // SVG-masked render
    const clipId = `img-mask-${block.id}`
    const path = maskPathFor(mask, w, h)
    return (
      <svg width="100%" height="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        <defs>
          <clipPath id={clipId}><path d={path} /></clipPath>
        </defs>
        <foreignObject x="0" y="0" width={w} height={h} clipPath={`url(#${clipId})`}>
          <img
            src={cfg.src}
            alt={cfg.alt || ''}
            style={{
              width: w, height: h,
              objectFit: fit,
              filter: filterStr,
              display: 'block',
            }}
          />
        </foreignObject>
        {borderWidth > 0 && (
          <path d={path} fill="none" stroke={borderColor || 'var(--accent)'} strokeWidth={borderWidth} />
        )}
      </svg>
    )
  }

  const containerStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    background: cfg.src ? 'transparent' : 'var(--surface-muted)',
    borderRadius: mask === 'none' ? radius : 0,
    overflow: 'hidden',
    position: 'relative',
    outline: isSelected ? '2px solid var(--accent)' : undefined,
    outlineOffset: -2,
    boxShadow: shadow ? '0 12px 40px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.08)' : undefined,
    border: mask === 'none' && borderWidth > 0 ? `${borderWidth}px solid ${borderColor || 'var(--accent)'}` : undefined,
  }

  if (!cfg.src) {
    return (
      <div
        style={containerStyle}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
      >
        <div className="w-full h-full flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg cursor-pointer transition-colors hover:bg-[var(--surface-strong)]"
          style={{ borderColor: 'var(--border)' }}
          onClick={() => fileInputRef.current?.click()}>
          <Upload size={20} style={{ color: 'var(--text-subtle)', opacity: 0.7 }} />
          <p className="text-[11px]" style={{ color: 'var(--text-subtle)' }}>
            Clique ou arraste uma imagem
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onUpload(file)
          }}
        />
      </div>
    )
  }

  return (
    <div style={containerStyle}>
      {renderImg(block.bounds.w, block.bounds.h)}
      {cfg.caption && (
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          padding: '8px 10px',
          background: 'linear-gradient(to top, rgba(0,0,0,0.65), transparent)',
          color: cfg.captionColor || '#fff',
          fontSize: 10,
          letterSpacing: 0.2,
          fontWeight: 500,
        }}>
          {cfg.caption}
        </div>
      )}
    </div>
  )
}
