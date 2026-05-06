import { useRef, useCallback, useEffect, useState } from 'react'
import {
  TrendingUp, TrendingDown, Minus, Quote,
  AlignLeft, AlignCenter, AlignRight,
  Bold, Italic, Sparkles,
} from 'lucide-react'
import { useStudioStore } from '../../store/studioStore'
import FloatingToolbar, { TbButton, TbGroup, TbColorSwatch } from '../FloatingToolbar'
import type { Block, CardBlockConfig, CardTemplate, CardFontFamily } from '../../types'

interface Props {
  block: Block
  isSelected: boolean
}

/* ── Font helpers ─────────────────────────────────────────────────── */
function fontFamilyCss(key: CardFontFamily | undefined): string {
  switch (key) {
    case 'condensed': return 'var(--font-condensed), system-ui, sans-serif'
    case 'serif':     return 'Georgia, "Times New Roman", serif'
    case 'mono':      return '"SF Mono", "JetBrains Mono", Consolas, monospace'
    default:          return 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
  }
}

const TEMPLATE_OPTIONS: { id: CardTemplate; label: string }[] = [
  { id: 'stat', label: 'KPI' },
  { id: 'minimal', label: 'Minimal' },
  { id: 'trend', label: 'Tendência' },
  { id: 'progress', label: 'Progresso' },
  { id: 'icon', label: 'Ícone' },
  { id: 'quote', label: 'Citação' },
  { id: 'highlight', label: 'Destaque' },
  { id: 'gradient', label: 'Gradiente' },
  { id: 'numbered', label: 'Numerado' },
  { id: 'badge', label: 'Badge' },
  { id: 'comparison', label: 'Comparação' },
  { id: 'split', label: 'Split' },
  { id: 'pill', label: 'Pill' },
]

export default function CardBlock({ block, isSelected }: Props) {
  const cfg = (block.config || {}) as CardBlockConfig
  const containerRef = useRef<HTMLDivElement>(null)
  const { patchBlockConfig } = useStudioStore()

  const [editingField, setEditingField] = useState<string | null>(null)
  const [showTemplates, setShowTemplates] = useState(false)

  /* Close template picker on outside click. */
  useEffect(() => {
    if (!showTemplates) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest('[data-card-templates]')) setShowTemplates(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [showTemplates])

  const template: CardTemplate = cfg.template || 'stat'
  const accent = cfg.color || '#2563eb'
  const bg = cfg.backgroundColor || 'transparent'
  const txt = cfg.textColor || 'var(--text)'
  const align = cfg.align || 'left'
  const radius = cfg.rounded ?? 10
  const padding = cfg.padding ?? 16
  const family = fontFamilyCss(cfg.fontFamily)

  const wrapStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    background: bg,
    borderRadius: radius,
    overflow: 'hidden',
    outline: isSelected ? '2px solid var(--accent)' : undefined,
    outlineOffset: -2,
    boxShadow: cfg.shadow ? '0 6px 24px rgba(0,0,0,0.18), 0 1px 4px rgba(0,0,0,0.08)' : undefined,
    border: cfg.border ? `1px solid ${cfg.borderColor || 'rgba(125,140,160,0.18)'}` : undefined,
    color: txt,
    textAlign: align,
    position: 'relative',
    fontFamily: family,
  }

  const update = (patch: Partial<CardBlockConfig>) => patchBlockConfig(block.id, patch)
  const updateField = (key: keyof CardBlockConfig, value: string) => {
    patchBlockConfig(block.id, { [key]: value })
  }

  /* Field used by all templates. Renders contentEditable when isSelected. */
  const Editable = useCallback(({ value, fieldKey, style, placeholder }: {
    value: string | undefined
    fieldKey: string
    style: React.CSSProperties
    placeholder?: string
  }) => {
    const ref = useRef<HTMLDivElement>(null)
    const isEditing = editingField === fieldKey

    useEffect(() => {
      if (isEditing && ref.current) {
        ref.current.focus()
        const sel = window.getSelection()
        if (sel && ref.current.firstChild) {
          const range = document.createRange()
          range.selectNodeContents(ref.current)
          range.collapse(false)
          sel.removeAllRanges()
          sel.addRange(range)
        }
      }
    }, [isEditing])

    const onBlur = () => {
      const text = ref.current?.innerText.trim() || ''
      updateField(fieldKey as keyof CardBlockConfig, text)
      setEditingField(null)
    }

    const onKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ref.current?.blur() }
      if (e.key === 'Escape') { ref.current?.blur() }
    }

    if (isEditing) {
      return (
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onBlur={onBlur}
          onKeyDown={onKeyDown}
          onMouseDown={(e) => e.stopPropagation()}
          style={{ ...style, outline: '1px dashed var(--accent)', outlineOffset: 2, cursor: 'text', minHeight: '1em' }}
        >
          {value || ''}
        </div>
      )
    }
    return (
      <div
        style={{ ...style, cursor: isSelected ? 'text' : 'default' }}
        onDoubleClick={(e) => { e.stopPropagation(); if (isSelected) setEditingField(fieldKey) }}
      >
        {value || (isSelected ? <span style={{ opacity: 0.4 }}>{placeholder || ''}</span> : '')}
      </div>
    )
  }, [editingField, isSelected])

  const cardCommon = { cfg, accent, txt, wrapStyle, padding, Editable }

  const body = (() => {
    switch (template) {
      case 'trend':       return <TrendCard {...cardCommon} />
      case 'quote':       return <QuoteCard {...cardCommon} />
      case 'highlight':   return <HighlightCard {...cardCommon} />
      case 'numbered':    return <NumberedCard {...cardCommon} />
      case 'badge':       return <BadgeCard {...cardCommon} />
      case 'comparison':  return <ComparisonCard {...cardCommon} />
      case 'progress':    return <ProgressCard {...cardCommon} />
      case 'icon':        return <IconCard {...cardCommon} />
      case 'minimal':     return <MinimalCard {...cardCommon} />
      case 'gradient':    return <GradientCard {...cardCommon} />
      case 'split':       return <SplitCard {...cardCommon} />
      case 'pill':        return <PillCard {...cardCommon} />
      default:            return <StatCard {...cardCommon} />
    }
  })()

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <FloatingToolbar visible={isSelected} containerRef={containerRef}>
        {/* Template */}
        <TbGroup>
          <div style={{ position: 'relative' }} data-card-templates>
            <button
              style={{
                height: 28, padding: '0 10px', borderRadius: 6, border: 'none',
                background: 'rgba(255,255,255,0.06)', color: '#fff',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
              onMouseDown={(e) => { e.preventDefault(); setShowTemplates((s) => !s) }}
              title="Template"
            >
              <Sparkles size={12} />
              {TEMPLATE_OPTIONS.find((t) => t.id === template)?.label || 'Template'}
            </button>
            {showTemplates && (
              <div
                data-card-templates
                style={{
                  position: 'absolute', top: 36, left: 0, zIndex: 100000,
                  background: 'rgba(24,32,44,0.98)',
                  border: '1px solid rgba(255,255,255,0.10)', borderRadius: 10,
                  padding: 6,
                  boxShadow: '0 16px 48px rgba(0,0,0,0.55)',
                  backdropFilter: 'blur(16px)',
                  display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4,
                  width: 240,
                }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                {TEMPLATE_OPTIONS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => { update({ template: t.id }); setShowTemplates(false) }}
                    style={{
                      padding: '6px 8px',
                      borderRadius: 5, border: 'none', cursor: 'pointer',
                      background: template === t.id ? 'rgba(31,111,160,0.4)' : 'rgba(255,255,255,0.04)',
                      color: template === t.id ? '#fff' : 'rgba(255,255,255,0.85)',
                      fontSize: 11, fontWeight: 600, textAlign: 'left',
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </TbGroup>

        {/* Font */}
        <TbGroup>
          <select
            value={cfg.fontFamily || 'sans'}
            onChange={(e) => update({ fontFamily: e.target.value as CardFontFamily })}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              height: 28, borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.10)',
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.9)',
              fontSize: 11, fontWeight: 500, padding: '0 6px',
              cursor: 'pointer', outline: 'none',
            }}
          >
            <option value="sans">Sans</option>
            <option value="condensed">Condensed</option>
            <option value="serif">Serif</option>
            <option value="mono">Mono</option>
          </select>
        </TbGroup>

        {/* Value size */}
        <TbGroup>
          <TbButton onClick={() => update({ valueSize: Math.max(10, (cfg.valueSize ?? 34) - 2) })} title="Diminuir valor">−</TbButton>
          <span style={{ minWidth: 26, textAlign: 'center', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>
            {cfg.valueSize ?? 34}
          </span>
          <TbButton onClick={() => update({ valueSize: Math.min(120, (cfg.valueSize ?? 34) + 2) })} title="Aumentar valor">+</TbButton>
        </TbGroup>

        {/* Colors */}
        <TbGroup>
          <TbColorSwatch value={cfg.color || '#2563eb'} onChange={(c) => update({ color: c })} title="Cor de destaque" />
          <TbColorSwatch value={cfg.backgroundColor || 'transparent'} onChange={(c) => update({ backgroundColor: c })} title="Fundo" />
          <TbColorSwatch value={cfg.textColor || '#ffffff'} onChange={(c) => update({ textColor: c })} title="Cor do texto" />
        </TbGroup>

        {/* Style toggles */}
        <TbGroup>
          <TbButton active={!!cfg.italicValue} onClick={() => update({ italicValue: !cfg.italicValue })} title="Valor itálico">
            <Italic size={13} />
          </TbButton>
          <TbButton active={(cfg.valueWeight ?? 600) >= 700} onClick={() => update({ valueWeight: (cfg.valueWeight ?? 600) >= 700 ? 600 : 800 })} title="Valor negrito">
            <Bold size={13} />
          </TbButton>
        </TbGroup>

        {/* Align */}
        <TbGroup last>
          <TbButton active={align === 'left'} onClick={() => update({ align: 'left' })} title="Esquerda">
            <AlignLeft size={13} />
          </TbButton>
          <TbButton active={align === 'center'} onClick={() => update({ align: 'center' })} title="Centro">
            <AlignCenter size={13} />
          </TbButton>
          <TbButton active={align === 'right'} onClick={() => update({ align: 'right' })} title="Direita">
            <AlignRight size={13} />
          </TbButton>
        </TbGroup>
      </FloatingToolbar>

      {body}
    </div>
  )
}

/* ── Card variants ────────────────────────────────────────────────── */

interface CardProps {
  cfg: CardBlockConfig
  accent: string
  txt: string
  wrapStyle: React.CSSProperties
  padding: number
  Editable: React.ComponentType<{
    value: string | undefined
    fieldKey: string
    style: React.CSSProperties
    placeholder?: string
  }>
}

function StatCard({ cfg, accent, txt, wrapStyle, padding, Editable }: CardProps) {
  const tSize = cfg.titleSize ?? 10
  const vSize = cfg.valueSize ?? 34
  const sSize = cfg.subtitleSize ?? 11
  return (
    <div style={{ ...wrapStyle, padding: `${padding * 0.75}px ${padding}px`, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      {cfg.showAccentBar !== false && <AccentBar position={cfg.accentBarPosition} width={cfg.accentBarWidth} accent={accent} />}
      <Editable
        value={cfg.title}
        fieldKey="title"
        placeholder="INDICADOR"
        style={{
          fontSize: tSize, color: 'var(--text-subtle)',
          textTransform: 'uppercase', letterSpacing: '0.8px',
          fontWeight: cfg.titleWeight ?? 600,
          fontStyle: cfg.italicTitle ? 'italic' : 'normal',
        }}
      />
      <Editable
        value={cfg.value}
        fieldKey="value"
        placeholder="0"
        style={{
          fontSize: vSize, fontWeight: cfg.valueWeight ?? 600, color: txt,
          lineHeight: 1.1, margin: '4px 0',
          fontStyle: cfg.italicValue ? 'italic' : 'normal',
        }}
      />
      {(cfg.subtitle !== undefined || true) && (
        <Editable
          value={cfg.subtitle}
          fieldKey="subtitle"
          placeholder="↑ 0%"
          style={{
            fontSize: sSize, fontWeight: 500,
            color: cfg.trend === 'down' ? '#dc2626' : cfg.trend === 'up' ? '#16a34a' : 'var(--text-muted)',
            lineHeight: 1.3,
          }}
        />
      )}
    </div>
  )
}

function MinimalCard({ cfg, txt, wrapStyle, padding, Editable }: CardProps) {
  const vSize = cfg.valueSize ?? 56
  return (
    <div style={{ ...wrapStyle, padding: `${padding * 0.7}px ${padding}px`, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <Editable
        value={cfg.title}
        fieldKey="title"
        placeholder="rótulo"
        style={{
          fontSize: cfg.titleSize ?? 10, color: 'var(--text-subtle)',
          textTransform: 'uppercase', letterSpacing: '1.5px',
          fontWeight: 500,
          marginBottom: 6,
        }}
      />
      <Editable
        value={cfg.value}
        fieldKey="value"
        placeholder="0"
        style={{
          fontSize: vSize, fontWeight: cfg.valueWeight ?? 200, color: txt,
          lineHeight: 0.95, letterSpacing: '-1px',
          fontStyle: cfg.italicValue ? 'italic' : 'normal',
        }}
      />
      {cfg.subtitle && (
        <Editable
          value={cfg.subtitle}
          fieldKey="subtitle"
          style={{
            fontSize: cfg.subtitleSize ?? 11, color: 'var(--text-muted)',
            marginTop: 6, fontWeight: 400,
          }}
        />
      )}
    </div>
  )
}

function ProgressCard({ cfg, accent, txt, wrapStyle, padding, Editable }: CardProps) {
  const max = cfg.progressMax ?? 100
  const v = Math.max(0, Math.min(max, cfg.progressValue ?? 50))
  const pct = (v / max) * 100
  return (
    <div style={{ ...wrapStyle, padding: `${padding * 0.75}px ${padding}px`, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8 }}>
      <Editable value={cfg.title} fieldKey="title" placeholder="META"
        style={{
          fontSize: cfg.titleSize ?? 10, color: 'var(--text-subtle)',
          textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 600,
        }}
      />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <Editable value={cfg.value} fieldKey="value" placeholder="50"
          style={{
            fontSize: cfg.valueSize ?? 28, fontWeight: cfg.valueWeight ?? 700,
            color: txt, lineHeight: 1,
          }}
        />
        <span style={{ fontSize: 12, color: 'var(--text-subtle)' }}>/ {max}</span>
      </div>
      <div style={{ position: 'relative', height: 6, borderRadius: 3, background: 'rgba(125,140,160,0.18)', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${pct}%`,
          background: cfg.colorSecondary
            ? `linear-gradient(90deg, ${accent}, ${cfg.colorSecondary})`
            : accent,
          borderRadius: 3,
          transition: 'width 0.3s',
        }} />
      </div>
      {cfg.subtitle && (
        <Editable value={cfg.subtitle} fieldKey="subtitle"
          style={{ fontSize: cfg.subtitleSize ?? 10, color: 'var(--text-muted)', lineHeight: 1.4 }}
        />
      )}
    </div>
  )
}

function IconCard({ cfg, accent, txt, wrapStyle, padding, Editable }: CardProps) {
  const initial = (cfg.icon || cfg.title?.[0] || '◆').slice(0, 2).toUpperCase()
  return (
    <div style={{ ...wrapStyle, padding: `${padding * 0.75}px ${padding}px`, display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{
        width: 44, height: 44, borderRadius: 10, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `${accent}1f`,
        color: accent,
        fontSize: 18, fontWeight: 700,
        fontFamily: 'var(--font-condensed)',
      }}>
        {initial}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Editable value={cfg.title} fieldKey="title" placeholder="Categoria"
          style={{
            fontSize: cfg.titleSize ?? 10, color: 'var(--text-subtle)',
            textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 600,
          }}
        />
        <Editable value={cfg.value} fieldKey="value" placeholder="0"
          style={{
            fontSize: cfg.valueSize ?? 24, fontWeight: cfg.valueWeight ?? 700, color: txt,
            lineHeight: 1.1, marginTop: 2,
          }}
        />
        {cfg.subtitle && (
          <Editable value={cfg.subtitle} fieldKey="subtitle"
            style={{ fontSize: cfg.subtitleSize ?? 10, color: 'var(--text-muted)', marginTop: 2 }}
          />
        )}
      </div>
    </div>
  )
}

function GradientCard({ cfg, accent, wrapStyle, padding, Editable }: CardProps) {
  const second = cfg.colorSecondary || shade(accent, -30)
  const angle = 135
  return (
    <div style={{
      ...wrapStyle,
      padding: `${padding}px ${padding}px`,
      background: `linear-gradient(${angle}deg, ${accent} 0%, ${second} 100%)`,
      color: '#fff',
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
    }}>
      <Editable value={cfg.title} fieldKey="title" placeholder="DESTAQUE"
        style={{
          fontSize: cfg.titleSize ?? 10, color: 'rgba(255,255,255,0.78)',
          textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700,
        }}
      />
      <Editable value={cfg.value} fieldKey="value" placeholder="100%"
        style={{
          fontSize: cfg.valueSize ?? 38, fontWeight: cfg.valueWeight ?? 800,
          color: '#fff', lineHeight: 1.05, margin: '6px 0',
          textShadow: '0 1px 2px rgba(0,0,0,0.18)',
        }}
      />
      {cfg.subtitle && (
        <Editable value={cfg.subtitle} fieldKey="subtitle"
          style={{ fontSize: cfg.subtitleSize ?? 12, color: 'rgba(255,255,255,0.92)', fontWeight: 500, lineHeight: 1.4 }}
        />
      )}
    </div>
  )
}

function SplitCard({ cfg, accent, txt, wrapStyle, padding, Editable }: CardProps) {
  return (
    <div style={{
      ...wrapStyle,
      display: 'grid',
      gridTemplateColumns: '40% 60%',
      padding: 0,
    }}>
      <div style={{
        background: `${accent}1a`,
        padding,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        borderRight: `2px solid ${accent}`,
      }}>
        <Editable value={cfg.title} fieldKey="title" placeholder="rótulo"
          style={{
            fontSize: cfg.titleSize ?? 10, color: accent,
            textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 700,
          }}
        />
        {cfg.subtitle && (
          <Editable value={cfg.subtitle} fieldKey="subtitle"
            style={{ fontSize: cfg.subtitleSize ?? 10, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4 }}
          />
        )}
      </div>
      <div style={{ padding, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Editable value={cfg.value} fieldKey="value" placeholder="0"
          style={{
            fontSize: cfg.valueSize ?? 32, fontWeight: cfg.valueWeight ?? 700,
            color: txt, lineHeight: 1, fontFamily: 'inherit',
          }}
        />
      </div>
    </div>
  )
}

function PillCard({ cfg, accent, wrapStyle, padding, Editable }: CardProps) {
  return (
    <div style={{
      ...wrapStyle,
      borderRadius: 999,
      padding: `${Math.max(8, padding * 0.5)}px ${padding}px`,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      background: cfg.backgroundColor && cfg.backgroundColor !== 'transparent' ? cfg.backgroundColor : `${accent}1f`,
      border: `1px solid ${accent}66`,
      gap: 10,
    }}>
      <Editable value={cfg.title} fieldKey="title" placeholder="Label"
        style={{
          fontSize: cfg.titleSize ?? 11, color: accent, fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.5px',
        }}
      />
      <Editable value={cfg.value} fieldKey="value" placeholder="0"
        style={{
          fontSize: cfg.valueSize ?? 16, fontWeight: cfg.valueWeight ?? 700,
          color: 'var(--text)',
        }}
      />
    </div>
  )
}

function TrendCard({ cfg, accent, txt, wrapStyle, padding, Editable }: CardProps) {
  const trend = cfg.trend || 'flat'
  const Icon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus
  const trendColor = trend === 'up' ? '#16a34a' : trend === 'down' ? '#dc2626' : 'var(--text-subtle)'
  return (
    <div style={{ ...wrapStyle, padding: `${padding * 0.75}px ${padding}px`, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <Editable value={cfg.title} fieldKey="title" placeholder="TENDÊNCIA"
          style={{
            fontSize: cfg.titleSize ?? 10, color: 'var(--text-subtle)',
            textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 600, flex: 1,
          }}
        />
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 3,
          fontSize: 11, fontWeight: 700, color: trendColor,
          background: trend === 'up' ? 'rgba(22,163,74,0.12)' : trend === 'down' ? 'rgba(220,38,38,0.12)' : 'rgba(120,130,145,0.12)',
          padding: '2px 6px', borderRadius: 4, flexShrink: 0,
        }}>
          <Icon size={11} strokeWidth={2.5} />
          {cfg.delta || '+0%'}
        </span>
      </div>
      <Editable value={cfg.value} fieldKey="value" placeholder="0"
        style={{
          fontSize: cfg.valueSize ?? 32, fontWeight: cfg.valueWeight ?? 700, color: txt,
          lineHeight: 1.1,
        }}
      />
      {cfg.subtitle && (
        <Editable value={cfg.subtitle} fieldKey="subtitle"
          style={{ fontSize: cfg.subtitleSize ?? 10, color: 'var(--text-muted)', lineHeight: 1.4 }}
        />
      )}
      <svg viewBox="0 0 120 24" width="100%" height={20} preserveAspectRatio="none" style={{ marginTop: 4 }}>
        <defs>
          <linearGradient id={`trend-${accent.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity={0.45} />
            <stop offset="100%" stopColor={accent} stopOpacity={0} />
          </linearGradient>
        </defs>
        {trend === 'up' && (
          <>
            <polyline points="0,20 20,16 40,18 60,12 80,8 100,6 120,2"
              fill="none" stroke={accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <polygon points="0,24 0,20 20,16 40,18 60,12 80,8 100,6 120,2 120,24"
              fill={`url(#trend-${accent.replace('#', '')})`} />
          </>
        )}
        {trend === 'down' && (
          <polyline points="0,4 20,8 40,6 60,12 80,16 100,18 120,22"
            fill="none" stroke="#dc2626" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        )}
        {trend === 'flat' && (
          <polyline points="0,12 20,11 40,13 60,12 80,11 100,13 120,12"
            fill="none" stroke="var(--text-subtle)" strokeWidth="1.5" strokeLinecap="round" />
        )}
      </svg>
    </div>
  )
}

function QuoteCard({ cfg, accent, txt, wrapStyle, padding, Editable }: CardProps) {
  return (
    <div style={{
      ...wrapStyle,
      padding: `${padding}px ${padding * 1.2}px`,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      background: wrapStyle.background !== 'transparent' ? wrapStyle.background : `${accent}14`,
      fontFamily: cfg.fontFamily ? wrapStyle.fontFamily : 'Georgia, serif',
    }}>
      <Quote size={20} style={{ color: accent, opacity: 0.6 }} />
      <Editable value={cfg.value || cfg.subtitle} fieldKey="value" placeholder="Texto da citação aqui."
        style={{
          fontSize: cfg.valueSize ?? 14, fontStyle: 'italic', color: txt,
          lineHeight: 1.5, fontWeight: 500, margin: '6px 0',
        }}
      />
      <Editable value={cfg.author} fieldKey="author" placeholder="— autor"
        style={{
          fontSize: cfg.subtitleSize ?? 10, color: 'var(--text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 600,
          marginTop: 6, paddingTop: 6,
          borderTop: '1px solid rgba(255,255,255,0.06)',
        }}
      />
    </div>
  )
}

function HighlightCard({ cfg, accent, wrapStyle, padding, Editable }: CardProps) {
  return (
    <div style={{
      ...wrapStyle,
      padding: `${padding}px ${padding * 1.2}px`,
      background: `linear-gradient(135deg, ${accent}, ${shade(accent, -25)})`,
      color: '#fff',
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
    }}>
      <Editable value={cfg.title} fieldKey="title" placeholder="DESTAQUE"
        style={{
          fontSize: cfg.titleSize ?? 10, color: 'rgba(255,255,255,0.75)',
          textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 700,
        }}
      />
      <Editable value={cfg.value} fieldKey="value" placeholder="100%"
        style={{
          fontSize: cfg.valueSize ?? 40, fontWeight: cfg.valueWeight ?? 800,
          color: '#fff', lineHeight: 1.05, margin: '6px 0',
          textShadow: '0 1px 2px rgba(0,0,0,0.15)',
        }}
      />
      {cfg.subtitle && (
        <Editable value={cfg.subtitle} fieldKey="subtitle"
          style={{ fontSize: cfg.subtitleSize ?? 12, color: 'rgba(255,255,255,0.92)', fontWeight: 500, lineHeight: 1.4 }}
        />
      )}
    </div>
  )
}

function NumberedCard({ cfg, accent, txt, wrapStyle, padding, Editable }: CardProps) {
  return (
    <div style={{ ...wrapStyle, padding: `${padding * 0.75}px ${padding}px`, display: 'flex', alignItems: 'center', gap: 14 }}>
      <Editable value={cfg.value} fieldKey="value" placeholder="01"
        style={{
          flexShrink: 0,
          fontSize: cfg.valueSize ?? 56, fontWeight: cfg.valueWeight ?? 800,
          lineHeight: 1, color: accent,
          opacity: 0.95, letterSpacing: '-2px',
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Editable value={cfg.title} fieldKey="title" placeholder="Título"
          style={{ fontSize: cfg.titleSize ?? 12, fontWeight: 700, color: txt, lineHeight: 1.2, marginBottom: 2 }}
        />
        {cfg.subtitle && (
          <Editable value={cfg.subtitle} fieldKey="subtitle"
            style={{ fontSize: cfg.subtitleSize ?? 11, color: 'var(--text-muted)', lineHeight: 1.4 }}
          />
        )}
      </div>
    </div>
  )
}

function BadgeCard({ cfg, accent, txt, wrapStyle, padding, Editable }: CardProps) {
  return (
    <div style={{ ...wrapStyle, padding: `${padding * 0.75}px ${padding}px`, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      {cfg.badge && (
        <span style={{
          alignSelf: wrapStyle.textAlign === 'center' ? 'center' : 'flex-start',
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontSize: 9, fontWeight: 700, color: accent,
          textTransform: 'uppercase', letterSpacing: '1px',
          background: `${accent}1f`, padding: '3px 7px', borderRadius: 4,
          marginBottom: 6,
          width: 'fit-content',
        }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: accent }} />
          {cfg.badge}
        </span>
      )}
      <Editable value={cfg.value} fieldKey="value" placeholder="0"
        style={{
          fontSize: cfg.valueSize ?? 28, fontWeight: cfg.valueWeight ?? 700, color: txt,
          lineHeight: 1.1,
        }}
      />
      {cfg.subtitle && (
        <Editable value={cfg.subtitle} fieldKey="subtitle"
          style={{ fontSize: cfg.subtitleSize ?? 11, color: 'var(--text-muted)', lineHeight: 1.4, marginTop: 2 }}
        />
      )}
    </div>
  )
}

function ComparisonCard({ cfg, accent, txt, wrapStyle, padding, Editable }: CardProps) {
  return (
    <div style={{ ...wrapStyle, padding: `${padding * 0.75}px ${padding}px`, display: 'flex', flexDirection: 'column' }}>
      {cfg.title && (
        <Editable value={cfg.title} fieldKey="title"
          style={{
            fontSize: cfg.titleSize ?? 10, color: 'var(--text-subtle)',
            textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 600,
            marginBottom: 8,
          }}
        />
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 10, flex: 1 }}>
        <div style={{ textAlign: 'center' }}>
          <Editable value={cfg.value} fieldKey="value"
            style={{ fontSize: cfg.valueSize ?? 24, fontWeight: 700, color: accent, lineHeight: 1.1 }}
          />
          <Editable value={cfg.labelA} fieldKey="labelA" placeholder="Anterior"
            style={{ fontSize: 9, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.6px', marginTop: 3 }}
          />
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-subtle)', fontWeight: 500 }}>vs.</div>
        <div style={{ textAlign: 'center' }}>
          <Editable value={cfg.valueB} fieldKey="valueB"
            style={{ fontSize: cfg.valueSize ?? 24, fontWeight: 700, color: txt, lineHeight: 1.1 }}
          />
          <Editable value={cfg.labelB} fieldKey="labelB" placeholder="Atual"
            style={{ fontSize: 9, color: 'var(--text-subtle)', textTransform: 'uppercase', letterSpacing: '0.6px', marginTop: 3 }}
          />
        </div>
      </div>
      {cfg.subtitle && (
        <Editable value={cfg.subtitle} fieldKey="subtitle"
          style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', marginTop: 6 }}
        />
      )}
    </div>
  )
}

/* ── Helpers ───────────────────────────────────────────────────────── */

function AccentBar({ position, width, accent }: {
  position?: 'left' | 'top' | 'bottom' | 'right'
  width?: number
  accent: string
}) {
  const w = width ?? 3
  const pos = position || 'left'
  const style: React.CSSProperties = { position: 'absolute', background: accent }
  if (pos === 'left')  { style.left = 0; style.top = 0; style.bottom = 0; style.width = w }
  if (pos === 'right') { style.right = 0; style.top = 0; style.bottom = 0; style.width = w }
  if (pos === 'top')    { style.left = 0; style.right = 0; style.top = 0; style.height = w }
  if (pos === 'bottom') { style.left = 0; style.right = 0; style.bottom = 0; style.height = w }
  return <div style={style} />
}

function shade(hex: string, percent: number): string {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  if (h.length !== 6) return hex
  const num = parseInt(h, 16)
  const r = Math.max(0, Math.min(255, ((num >> 16) & 0xff) + (255 * percent) / 100))
  const g = Math.max(0, Math.min(255, ((num >> 8) & 0xff) + (255 * percent) / 100))
  const b = Math.max(0, Math.min(255, (num & 0xff) + (255 * percent) / 100))
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
}
