import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import ReactDOM from 'react-dom'
import { useStudioStore } from '../../store/studioStore'
import {
  Bold, Italic, Underline, Strikethrough,
  AlignLeft, AlignCenter, AlignRight, Check, Pencil,
} from 'lucide-react'
import type { Block, TextBlockConfig, FontFamilyKey } from '../../types'

interface Props {
  block: Block
  isSelected: boolean
}

const FONT_OPTIONS: { value: FontFamilyKey; label: string }[] = [
  { value: 'sans', label: 'Sans' },
  { value: 'condensed', label: 'Condensed' },
  { value: 'serif', label: 'Serif' },
  { value: 'mono', label: 'Mono' },
]

const COLOR_PALETTE = [
  '#000000', '#1a1a1a', '#2d2d2d', '#404040', '#595959', '#737373', '#8c8c8c', '#a6a6a6', '#bfbfbf', '#d9d9d9', '#f2f2f2', '#ffffff',
  '#1a0f00', '#331f00', '#4d2e00', '#663d00', '#804d00', '#995c00', '#b36b00', '#cc7a00', '#e68a00', '#ff9900', '#ffad33', '#ffc266',
  '#1a0500', '#330a00', '#4d0f00', '#661400', '#801a00', '#991f00', '#b32400', '#cc2900', '#e62e00', '#ff3300', '#ff5c33', '#ff8566',
  '#1a0005', '#33000a', '#4d000f', '#660014', '#80001a', '#99001f', '#b30024', '#cc0029', '#e6002e', '#ff0033', '#ff3366', '#ff6699',
  '#0f001a', '#1f0033', '#2e004d', '#3d0066', '#4d0080', '#5c0099', '#6b00b3', '#7a00cc', '#8a00e6', '#9900ff', '#b33dff', '#cc80ff',
  '#05001a', '#0a0033', '#0f004d', '#140066', '#1a0080', '#1f0099', '#2400b3', '#2900cc', '#2e00e6', '#3300ff', '#6633ff', '#9980ff',
  '#00101a', '#002033', '#00304d', '#004066', '#005080', '#005f99', '#006fb3', '#007fcc', '#008fe6', '#009fff', '#33b8ff', '#80d4ff',
  '#001a10', '#003320', '#004d30', '#006640', '#008050', '#009960', '#00b370', '#00cc80', '#00e690', '#00ffa0', '#33ffbb', '#80ffd6',
  '#0a1a00', '#143300', '#1f4d00', '#296600', '#338000', '#3d9900', '#47b300', '#52cc00', '#5ce600', '#66ff00', '#8cff33', '#b3ff80',
]

function fontFamilyCss(key: FontFamilyKey | undefined): string {
  switch (key) {
    case 'condensed':
      return 'var(--font-condensed), system-ui, sans-serif'
    case 'serif':
      return 'Georgia, "Times New Roman", serif'
    case 'mono':
      return '"SF Mono", "JetBrains Mono", Consolas, monospace'
    default:
      return 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
  }
}

function sanitizeHtml(raw: string): string {
  const div = document.createElement('div')
  div.innerHTML = raw
  const allowed = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'SPAN', 'BR'])
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) return
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement
      if (!allowed.has(el.tagName)) {
        const parent = el.parentNode
        if (parent) {
          while (el.firstChild) parent.insertBefore(el.firstChild, el)
          parent.removeChild(el)
        }
        return
      }
      if (el.tagName !== 'SPAN') {
        while (el.attributes.length > 0) el.removeAttribute(el.attributes[0].name)
      } else {
        const style = el.getAttribute('style')
        while (el.attributes.length > 0) el.removeAttribute(el.attributes[0].name)
        if (style) el.setAttribute('style', style)
      }
    }
    Array.from(node.childNodes).forEach(walk)
  }
  Array.from(div.childNodes).forEach(walk)
  return div.innerHTML
}

/* ── Canva-style floating toolbar ── */
function TextToolbar({
  visible,
  editing,
  containerRef,
  toolbarRef,
  onStartEdit,
  onCommit,
  onExec,
  onAlign,
  onFontSize,
  onFontFamily,
  onColor,
  formats,
  color,
  align,
  fontSize,
  fontFamily,
}: {
  visible: boolean
  editing: boolean
  containerRef: React.RefObject<HTMLDivElement>
  toolbarRef: React.RefObject<HTMLDivElement>
  onStartEdit: () => void
  onCommit: () => void
  onExec: (cmd: string, val?: string) => void
  onAlign: (a: 'left' | 'center' | 'right') => void
  onFontSize: (s: number) => void
  onFontFamily: (f: FontFamilyKey) => void
  onColor: (c: string) => void
  formats: { bold: boolean; italic: boolean; underline: boolean; strikethrough: boolean }
  color: string
  align: 'left' | 'center' | 'right'
  fontSize: number
  fontFamily: FontFamilyKey
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [showPalette, setShowPalette] = useState(false)
  const paletteRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!visible || !containerRef.current) { setPos(null); return }
    const rect = containerRef.current.getBoundingClientRect()
    setPos({ top: rect.top - 52, left: rect.left + rect.width / 2 })
  }, [visible, containerRef, editing])

  useEffect(() => {
    if (!showPalette) return
    const onDown = (e: MouseEvent) => {
      if (!paletteRef.current?.contains(e.target as Node)) {
        setShowPalette(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [showPalette])

  if (!visible || !pos) return null

  const btn = (active: boolean): React.CSSProperties => ({
    width: 30,
    height: 30,
    borderRadius: 6,
    border: '1px solid transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    background: active ? 'rgba(255,255,255,0.14)' : 'transparent',
    color: active ? '#fff' : 'rgba(255,255,255,0.65)',
    transition: 'all 0.08s',
    flexShrink: 0,
  })

  const group: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
    padding: '0 5px',
    borderRight: '1px solid rgba(255,255,255,0.08)',
  }

  return ReactDOM.createPortal(
    <div ref={toolbarRef} data-text-toolbar="true">
      <div
        className="hide-on-export"
        data-text-toolbar="true"
        style={{
          position: 'fixed',
          top: pos.top,
          left: pos.left,
          transform: 'translateX(-50%)',
          zIndex: 99999,
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          background: 'rgba(24,32,44,0.98)',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 10,
          padding: '4px 6px',
          boxShadow: '0 16px 48px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.25)',
          backdropFilter: 'blur(16px)',
          pointerEvents: 'auto',
          whiteSpace: 'nowrap',
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {/* Edit / Done */}
        <div style={group}>
          {editing ? (
            <button style={btn(true)} onMouseDown={(e) => { e.preventDefault(); onCommit() }} title="Concluir">
              <Check size={14} />
            </button>
          ) : (
            <button style={btn(false)} onMouseDown={(e) => { e.preventDefault(); onStartEdit() }} title="Editar">
              <Pencil size={13} />
            </button>
          )}
        </div>

        {/* Font family */}
        <div style={group}>
          <select
            value={fontFamily}
            onMouseDown={(e) => e.preventDefault()}
            onChange={(e) => onFontFamily(e.target.value as FontFamilyKey)}
            style={{
              height: 28,
              borderRadius: 6,
              border: '1px solid rgba(255,255,255,0.10)',
              background: 'rgba(255,255,255,0.06)',
              color: 'rgba(255,255,255,0.9)',
              fontSize: 12,
              fontWeight: 500,
              padding: '0 8px',
              cursor: 'pointer',
              outline: 'none',
              appearance: 'none',
              WebkitAppearance: 'none',
            }}
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>

        {/* Font size */}
        <div style={group}>
          <button style={btn(false)} onMouseDown={(e) => { e.preventDefault(); onFontSize(Math.max(7, fontSize - 1)) }}>−</button>
          <span style={{ minWidth: 28, textAlign: 'center', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>{fontSize}</span>
          <button style={btn(false)} onMouseDown={(e) => { e.preventDefault(); onFontSize(Math.min(120, fontSize + 1)) }}>+</button>
        </div>

        {/* Color picker button */}
        <div style={group}>
          <div style={{ position: 'relative' }}>
            <button
              style={{ ...btn(false), position: 'relative', overflow: 'hidden' }}
              onMouseDown={(e) => { e.preventDefault(); setShowPalette((s) => !s) }}
              title="Cor do texto"
            >
              <span style={{
                width: 18, height: 18, borderRadius: 4, display: 'block',
                background: color.startsWith('#') || color.startsWith('rgb') ? color : 'var(--text)',
                border: '1.5px solid rgba(255,255,255,0.3)',
              }} />
            </button>
          </div>
        </div>

        {/* Formatting */}
        <div style={group}>
          <button style={btn(formats.bold)} onMouseDown={(e) => { e.preventDefault(); onExec('bold') }} title="Negrito"><Bold size={13} strokeWidth={2.5} /></button>
          <button style={btn(formats.italic)} onMouseDown={(e) => { e.preventDefault(); onExec('italic') }} title="Itálico"><Italic size={13} strokeWidth={2.5} /></button>
          <button style={btn(formats.underline)} onMouseDown={(e) => { e.preventDefault(); onExec('underline') }} title="Sublinhado"><Underline size={13} strokeWidth={2.5} /></button>
          <button style={btn(formats.strikethrough)} onMouseDown={(e) => { e.preventDefault(); onExec('strikeThrough') }} title="Tachado"><Strikethrough size={13} strokeWidth={2.5} /></button>
        </div>

        {/* Alignment */}
        <div style={{ ...group, borderRight: 'none' }}>
          <button style={btn(align === 'left')} onMouseDown={(e) => { e.preventDefault(); onAlign('left') }} title="Esquerda"><AlignLeft size={14} /></button>
          <button style={btn(align === 'center')} onMouseDown={(e) => { e.preventDefault(); onAlign('center') }} title="Centro"><AlignCenter size={14} /></button>
          <button style={btn(align === 'right')} onMouseDown={(e) => { e.preventDefault(); onAlign('right') }} title="Direita"><AlignRight size={14} /></button>
        </div>
      </div>

      {/* Color palette popover */}
      {showPalette && (
        <div
          ref={paletteRef}
          className="hide-on-export"
          data-text-toolbar="true"
          style={{
            position: 'fixed',
            top: pos.top + 42,
            left: pos.left - 120,
            zIndex: 100000,
            background: 'rgba(24,32,44,0.98)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 10,
            padding: 10,
            boxShadow: '0 16px 48px rgba(0,0,0,0.55)',
            backdropFilter: 'blur(16px)',
            pointerEvents: 'auto',
            display: 'grid',
            gridTemplateColumns: 'repeat(12, 20px)',
            gap: 4,
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {COLOR_PALETTE.map((c) => (
            <button
              key={c}
              onClick={() => {
                onColor(c)
                setShowPalette(false)
              }}
              title={c}
              style={{
                width: 20,
                height: 20,
                borderRadius: 3,
                background: c,
                border: color === c ? '2px solid #fff' : '1px solid rgba(255,255,255,0.15)',
                cursor: 'pointer',
                padding: 0,
              }}
            />
          ))}
        </div>
      )}
    </div>,
    document.body
  )
}

export default function TextBlock({ block, isSelected }: Props) {
  const cfg = (block.config || {}) as TextBlockConfig
  const { patchBlockConfig } = useStudioStore()
  const [editing, setEditing] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)

  const [formats, setFormats] = useState({
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
  })

  const fontSize = cfg.fontSize ?? 18
  const fontWeight = cfg.fontWeight ?? 400
  const lineHeight = cfg.lineHeight ?? 1.5
  const letterSpacing = cfg.letterSpacing ?? 0
  const bodyColor = cfg.bodyColor ?? 'var(--text)'
  const alignment = cfg.alignment || 'left'
  const fontFamily = cfg.fontFamily || 'sans'
  const padding = cfg.padding ?? 12

  /* ── Edit mode ── */
  const startEditing = useCallback(() => {
    if (!isSelected) return
    setEditing(true)
  }, [isSelected])

  const commit = useCallback(() => {
    const html = editorRef.current?.innerHTML || ''
    patchBlockConfig(block.id, { content: sanitizeHtml(html) })
    setEditing(false)
  }, [block.id, patchBlockConfig])

  useEffect(() => {
    if (editing && editorRef.current) {
      editorRef.current.focus()
      const sel = window.getSelection()
      if (sel && editorRef.current.lastChild) {
        const range = document.createRange()
        range.selectNodeContents(editorRef.current)
        range.collapse(false)
        sel.removeAllRanges()
        sel.addRange(range)
      }
    }
  }, [editing])

  /* ── Click outside to commit ── */
  useEffect(() => {
    if (!editing) return
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      const inEditor = editorRef.current?.contains(target)
      const inToolbar = toolbarRef.current?.contains(target)
      if (!inEditor && !inToolbar) {
        commit()
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [editing, commit])

  /* ── Track selection formatting ── */
  useEffect(() => {
    if (!editing) return
    const onSel = () => {
      const check = (cmd: string) => document.queryCommandState(cmd)
      setFormats({
        bold: check('bold'),
        italic: check('italic'),
        underline: check('underline'),
        strikethrough: check('strikeThrough'),
      })
    }
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  }, [editing])

  /* ── Exec commands ── */
  const exec = useCallback((cmd: string, val?: string) => {
    if (!editing) return
    document.execCommand(cmd, false, val)
    const check = (c: string) => document.queryCommandState(c)
    setFormats({
      bold: check('bold'),
      italic: check('italic'),
      underline: check('underline'),
      strikethrough: check('strikeThrough'),
    })
  }, [editing])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { commit(); return }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); exec('bold') }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') { e.preventDefault(); exec('italic') }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') { e.preventDefault(); exec('underline') }
  }, [commit, exec])

  /* ── Background styles ── */
  const bg: React.CSSProperties = useMemo(() => {
    switch (cfg.backgroundStyle) {
      case 'card':
        return {
          background: cfg.backgroundColor && cfg.backgroundColor !== 'transparent' ? cfg.backgroundColor : 'rgba(30,40,55,0.45)',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
        }
      case 'glass':
        return {
          background: 'rgba(20,30,45,0.25)',
          border: '1px solid rgba(255,255,255,0.08)',
          backdropFilter: 'blur(12px) saturate(140%)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.04)',
        }
      case 'paper':
        return {
          background: cfg.backgroundColor && cfg.backgroundColor !== 'transparent' ? cfg.backgroundColor : 'rgba(245,247,250,0.06)',
          border: '1px solid rgba(255,255,255,0.04)',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }
      case 'strip':
        return {
          background: 'linear-gradient(135deg, rgba(31,111,160,0.08) 0%, rgba(20,30,45,0.3) 100%)',
          borderLeft: '3px solid var(--accent)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }
      case 'highlight':
        return {
          background: 'rgba(31,111,160,0.10)',
          border: '1px solid rgba(31,111,160,0.18)',
          boxShadow: '0 0 0 1px rgba(31,111,160,0.06)',
        }
      default:
        return { background: cfg.backgroundColor && cfg.backgroundColor !== 'transparent' ? cfg.backgroundColor : 'transparent' }
    }
  }, [cfg.backgroundStyle, cfg.backgroundColor])

  const empty = !cfg.content || cfg.content === '<br>' || !cfg.content.replace(/<[^>]*>/g, '').trim()

  const textStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    padding: `${padding}px ${padding * 1.1}px`,
    color: bodyColor,
    fontSize,
    fontWeight,
    lineHeight,
    letterSpacing: `${letterSpacing}px`,
    fontFamily: fontFamilyCss(fontFamily),
    textAlign: alignment,
    wordWrap: 'break-word',
    overflowWrap: 'break-word',
    whiteSpace: 'pre-wrap',
    outline: 'none',
    cursor: editing ? 'text' : 'default',
    boxSizing: 'border-box',
    ...bg,
  }

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
      <TextToolbar
        visible={isSelected}
        editing={editing}
        containerRef={containerRef}
        toolbarRef={toolbarRef}
        onStartEdit={startEditing}
        onCommit={commit}
        onExec={exec}
        onAlign={(a) => patchBlockConfig(block.id, { alignment: a })}
        onFontSize={(s) => patchBlockConfig(block.id, { fontSize: s })}
        onFontFamily={(f) => patchBlockConfig(block.id, { fontFamily: f })}
        onColor={(c) => exec('foreColor', c)}
        formats={formats}
        color={bodyColor}
        align={alignment}
        fontSize={fontSize}
        fontFamily={fontFamily}
      />

      {editing ? (
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          style={{
            ...textStyle,
            border: '1.5px solid var(--accent)',
            overflow: 'auto',
          }}
          onKeyDown={handleKeyDown}
          dangerouslySetInnerHTML={{ __html: cfg.content || '' }}
          spellCheck={false}
        />
      ) : (
        <div
          style={{ ...textStyle, overflow: 'hidden' }}
          onDoubleClick={startEditing}
          dangerouslySetInnerHTML={{
            __html: empty
              ? `<div style="height:100%;display:flex;align-items:center;justify-content:center;color:var(--text-subtle);opacity:0.35;font-size:${Math.max(11, fontSize * 0.85)}px">${isSelected ? 'Duplo-clique para editar' : ''}</div>`
              : (cfg.content || ''),
          }}
        />
      )}
    </div>
  )
}
