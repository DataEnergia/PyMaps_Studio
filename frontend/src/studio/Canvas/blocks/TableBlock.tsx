import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { Trophy, Medal, Award } from 'lucide-react'
import { useStudioStore } from '../../store/studioStore'
import type { Block, TableBlockConfig, TableTemplate } from '../../types'

interface Props {
  block: Block
  isSelected: boolean
}

export default function TableBlock({ block, isSelected }: Props) {
  const cfg = (block.config || {}) as TableBlockConfig
  const { patchBlockConfig } = useStudioStore()
  const template: TableTemplate = cfg.template || 'editorial'
  const columns = cfg.columns || []
  const rows = cfg.rows || []
  const visibleRows = rows.slice(0, cfg.maxRows || 50)

  /* Inline editing state. */
  const [editing, setEditing] = useState<{ row: number; col: string } | null>(null)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const startEdit = useCallback((rowIdx: number, colKey: string, currentValue: unknown) => {
    if (!isSelected) return
    setEditing({ row: rowIdx, col: colKey })
    setDraft(currentValue == null ? '' : String(currentValue))
  }, [isSelected])

  const commitEdit = useCallback(() => {
    if (!editing) return
    const col = columns.find((c) => c.key === editing.col)
    let value: unknown = draft
    if (col && (col.format === 'number' || col.format === 'currency' || col.format === 'percent')) {
      const n = parseFloat(draft.replace(',', '.'))
      value = Number.isFinite(n) ? n : draft
    }
    const nextRows = rows.map((r, i) => i === editing.row ? { ...r, [editing.col]: value } : r)
    patchBlockConfig(block.id, { rows: nextRows })
    setEditing(null)
  }, [editing, draft, rows, columns, block.id, patchBlockConfig])

  const cancelEdit = useCallback(() => setEditing(null), [])

  const startEditTitle = useCallback((field: 'title' | 'subtitle' | 'source') => {
    if (!isSelected) return
    const current = String(cfg[field] ?? '')
    const v = window.prompt(field === 'title' ? 'Título:' : field === 'subtitle' ? 'Subtítulo:' : 'Fonte:', current)
    if (v !== null) patchBlockConfig(block.id, { [field]: v })
  }, [isSelected, cfg, block.id, patchBlockConfig])

  /* Heatmap range */
  const valueColumn = cfg.valueColumn || (columns.find((c) => c.format === 'number' || c.format === 'currency' || c.format === 'percent')?.key)
  const valueRange = useMemo(() => {
    if (template !== 'heatmap' || !valueColumn) return { min: 0, max: 0 }
    const nums = visibleRows.map((r) => Number(r[valueColumn])).filter((n) => Number.isFinite(n))
    if (nums.length === 0) return { min: 0, max: 0 }
    return { min: Math.min(...nums), max: Math.max(...nums) }
  }, [template, valueColumn, visibleRows])

  const accent = cfg.accentColor || 'var(--accent)'
  const headerColor = cfg.headerColor || 'var(--text-subtle)'
  const cellColor = cfg.cellColor || 'var(--text)'
  const borderColor = cfg.borderColor || 'var(--border)'
  const headerSize = cfg.headerFontSize || 10
  const cellSize = cfg.cellFontSize || 11

  /* Per-template wrapper styles */
  const wrapStyle = (() => {
    const base: React.CSSProperties = {
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      borderRadius: 8, overflow: 'hidden',
      outline: isSelected ? '2px solid var(--accent)' : undefined,
      outlineOffset: -2,
    }
    if (template === 'card') {
      return { ...base, background: 'var(--surface-strong)', boxShadow: '0 4px 16px rgba(0,0,0,0.10)', border: `1px solid ${borderColor}` }
    }
    if (template === 'minimal' || template === 'editorial') {
      return { ...base, background: 'transparent' }
    }
    return { ...base, background: 'var(--surface-strong)' }
  })()

  const isStriped = template === 'striped'
  const isMinimal = template === 'minimal' || template === 'editorial'
  const isComparison = template === 'comparison'
  const isRanking = template === 'ranking'
  const isHeatmap = template === 'heatmap'

  return (
    <div style={wrapStyle}>
      {/* Title */}
      {(cfg.title || cfg.subtitle || isSelected) && (
        <div style={{
          padding: '12px 16px 8px',
          borderBottom: isMinimal ? `2px solid ${accent}` : `1px solid ${borderColor}`,
        }}>
          {(cfg.title || isSelected) && (
            <div
              onDoubleClick={(e) => { e.stopPropagation(); startEditTitle('title') }}
              style={{
                fontSize: 13, fontWeight: 700, color: 'var(--text)',
                fontFamily: template === 'editorial' ? 'var(--font-condensed)' : undefined,
                letterSpacing: template === 'editorial' ? 0.2 : 0,
                cursor: isSelected ? 'text' : 'default',
                opacity: cfg.title ? 1 : 0.4,
              }}
            >
              {cfg.title || (isSelected ? 'Duplo-clique para editar título' : '')}
            </div>
          )}
          {(cfg.subtitle || isSelected) && (
            <div
              onDoubleClick={(e) => { e.stopPropagation(); startEditTitle('subtitle') }}
              style={{
                fontSize: 10, color: 'var(--text-subtle)', marginTop: 2, lineHeight: 1.4,
                cursor: isSelected ? 'text' : 'default',
                opacity: cfg.subtitle ? 1 : 0.4,
              }}
            >
              {cfg.subtitle || (isSelected ? 'Duplo-clique para editar subtítulo' : '')}
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }} className="custom-scrollbar">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          {cfg.showHeader !== false && (
            <thead>
              <tr style={{
                borderBottom: isMinimal
                  ? `1.5px solid ${accent}`
                  : template === 'card' ? `1px solid ${borderColor}` : `1px solid ${borderColor}`,
                background: template === 'card' ? 'rgba(255,255,255,0.02)' : undefined,
              }}>
                {isRanking && (
                  <th style={{
                    padding: '10px 8px', textAlign: 'center', width: 36,
                    fontSize: 9, color: headerColor, fontWeight: 700,
                    textTransform: 'uppercase', letterSpacing: '0.6px',
                  }}>#</th>
                )}
                {columns.map((col, ci) => (
                  <th key={col.key} style={{
                    padding: '10px 12px',
                    textAlign: col.align || 'left',
                    fontWeight: template === 'editorial' ? 700 : 600,
                    color: headerColor,
                    fontSize: headerSize,
                    textTransform: template === 'editorial' || template === 'minimal' ? 'uppercase' : undefined,
                    letterSpacing: template === 'editorial' || template === 'minimal' ? '0.5px' : 0,
                    fontFamily: template === 'editorial' ? 'var(--font-condensed)' : undefined,
                    width: col.width,
                    borderRight: isComparison && ci === 0 ? `1px solid ${borderColor}` : undefined,
                  }}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {visibleRows.map((row, i) => {
              const stripe = isStriped && i % 2 === 1
              const rankIcon = isRanking && i === 0 ? <Trophy size={13} color="#f5b800" /> :
                isRanking && i === 1 ? <Medal size={13} color="#c0c0c0" /> :
                isRanking && i === 2 ? <Award size={13} color="#cd7f32" /> : null
              return (
                <tr key={i} style={{
                  borderBottom: isMinimal ? `1px solid rgba(125,140,160,0.10)` : `1px solid ${borderColor}`,
                  background: stripe ? 'rgba(125,140,160,0.05)' : undefined,
                  transition: 'background 0.12s',
                }}>
                  {isRanking && (
                    <td style={{
                      padding: '8px 8px', textAlign: 'center',
                      fontSize: 12, fontWeight: 700,
                      color: i < 3 ? '#f5b800' : 'var(--text-muted)',
                      fontFamily: 'var(--font-condensed)',
                    }}>
                      {rankIcon || (i + 1)}
                    </td>
                  )}
                  {columns.map((col, ci) => {
                    const val = row[col.key]
                    const isHeatCell = isHeatmap && col.key === valueColumn
                    const heatBg = isHeatCell ? heatColor(Number(val), valueRange.min, valueRange.max, accent) : undefined
                    const isEditingCell = editing?.row === i && editing?.col === col.key
                    return (
                      <td key={col.key} style={{
                        padding: '8px 12px',
                        textAlign: col.align || 'left',
                        fontSize: cellSize,
                        fontWeight: ci === 0 && isComparison ? 700 : (ci === 0 && isRanking ? 600 : 400),
                        fontFamily: ci === 0 && isComparison ? 'var(--font-condensed)' : undefined,
                        borderRight: isComparison && ci === 0 ? `1px solid ${borderColor}` : undefined,
                        background: heatBg,
                        color: isHeatCell ? heatTextColor(Number(val), valueRange.min, valueRange.max) : cellColor,
                        cursor: isSelected && !isEditingCell ? 'cell' : undefined,
                      } as React.CSSProperties}
                      onDoubleClick={(e) => { e.stopPropagation(); startEdit(i, col.key, val) }}
                      >
                        {isEditingCell ? (
                          <input
                            ref={inputRef}
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onBlur={commitEdit}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') { e.preventDefault(); commitEdit() }
                              if (e.key === 'Escape') { e.preventDefault(); cancelEdit() }
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            style={{
                              width: '100%',
                              fontSize: 'inherit',
                              fontWeight: 'inherit',
                              fontFamily: 'inherit',
                              color: 'inherit',
                              textAlign: 'inherit',
                              background: 'rgba(31,111,160,0.12)',
                              border: '1px solid var(--accent)',
                              borderRadius: 3,
                              padding: '2px 4px',
                              outline: 'none',
                            }}
                          />
                        ) : (
                          formatValue(val, col.format)
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={columns.length + (isRanking ? 1 : 0)} style={{
                  textAlign: 'center', color: 'var(--text-subtle)',
                  fontSize: 11, padding: '24px', fontStyle: 'italic',
                }}>
                  Sem dados — adicione linhas no painel direito
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer / source */}
      {(rows.length > (cfg.maxRows || 50) || cfg.source) && (
        <div style={{
          padding: '6px 16px',
          fontSize: 9,
          color: 'var(--text-subtle)',
          borderTop: `1px solid ${borderColor}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontStyle: cfg.source ? 'italic' : 'normal',
        }}>
          {cfg.source ? <span>Fonte: {cfg.source}</span> : <span />}
          {rows.length > (cfg.maxRows || 50) && <span>+{rows.length - (cfg.maxRows || 50)} linhas</span>}
        </div>
      )}
    </div>
  )
}

function formatValue(val: unknown, format?: string): string {
  if (val == null || val === '') return '—'
  if (format === 'currency' && typeof val === 'number') {
    return val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }
  if (format === 'percent' && typeof val === 'number') {
    return `${(val * 100).toFixed(1)}%`
  }
  if (format === 'number' && typeof val === 'number') {
    return val.toLocaleString('pt-BR')
  }
  if (format === 'date') {
    try {
      const d = new Date(String(val))
      if (!isNaN(d.getTime())) return d.toLocaleDateString('pt-BR')
    } catch { /* ignore */ }
  }
  return String(val)
}

function heatColor(v: number, min: number, max: number, _accent: string): string {
  if (!Number.isFinite(v) || max === min) return 'transparent'
  const t = (v - min) / (max - min) // 0..1
  // Diverging: cool blue → warm orange/red (mid is neutral)
  if (t < 0.5) {
    const k = t * 2 // 0..1
    return `rgba(31,111,160,${(0.05 + (1 - k) * 0.30).toFixed(3)})`
  }
  const k = (t - 0.5) * 2 // 0..1
  return `rgba(217,130,43,${(0.10 + k * 0.42).toFixed(3)})`
}

function heatTextColor(v: number, min: number, max: number): string {
  if (!Number.isFinite(v) || max === min) return 'var(--text)'
  const t = (v - min) / (max - min)
  return t > 0.7 ? '#fff' : 'var(--text)'
}
