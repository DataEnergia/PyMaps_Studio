import { useMemo, useState, useCallback, useEffect } from 'react'
import { useAppStore } from '../stores/appStore'
import { t, type Language } from '../i18n'
import ColorPicker from '../components/ColorPicker'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Map as MapIcon, CreditCard, Type, Table, BarChart3, ArrowRight, Minus, Image, Shapes,
  Trash2, Layers, SlidersHorizontal, X, Plus, Minus as MinusIcon, Clipboard,
} from 'lucide-react'
import { useStudioStore } from './store/studioStore'
import { CHART_PALETTE } from './Canvas/blocks/ChartBlock'
import { shapePath } from './Canvas/blocks/ShapeBlock'
import { uploadApi } from '../services/api'
import { DropZone, FileInfo } from '../components/layers/shared'
import type {
  Block, BlockType,
  CardBlockConfig, TextBlockConfig, ChartBlockConfig,
  ConnectorBlockConfig, DividerBlockConfig, ChartType, ChartCategory,
  TableBlockConfig, ImageBlockConfig, ShapeBlockConfig,
  CardTemplate, TableTemplate, ImageMaskShape, ShapeType,
  MarkerType, ConnectorStyle, LegendPosition, MapBlockConfig,
} from './types'

import { CHART_TYPE_META } from './types'

/* ── Chart category definitions ── */
function getChartCategories(language: Language): { id: ChartCategory; label: string }[] {
  return [
    { id: 'comparison', label: t(language, 'chart.cat.comparison') },
    { id: 'trend', label: t(language, 'chart.cat.trend') },
    { id: 'composition', label: t(language, 'chart.cat.composition') },
    { id: 'distribution', label: t(language, 'chart.cat.distribution') },
  ]
}

type SheetData = {
  name: string
  rows: Record<string, unknown>[]
  columns: string[]
}

function parseNumericValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (value === null || value === undefined) return null
  let raw = String(value).trim()
  if (!raw) return null
  raw = raw.replace(/[^0-9,.-]/g, '')
  const hasComma = raw.includes(',')
  const hasDot = raw.includes('.')
  if (hasComma && hasDot) {
    if (raw.lastIndexOf(',') > raw.lastIndexOf('.')) {
      raw = raw.replace(/\./g, '').replace(',', '.')
    } else {
      raw = raw.replace(/,/g, '')
    }
  } else if (hasComma) {
    raw = raw.replace(/\./g, '').replace(',', '.')
  }
  const num = Number(raw)
  return Number.isFinite(num) ? num : null
}

function ensureUniqueColumns(cols: string[], columnLabel = 'Coluna'): string[] {
  const seen = new Map<string, number>()
  return cols.map((c) => {
    const base = c || columnLabel
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    return count === 0 ? base : `${base} ${count + 1}`
  })
}

function guessDelimiter(lines: string[]): string {
  if (lines.some((l) => l.includes('\t'))) return '\t'
  const sample = lines.slice(0, 6)
  const commas = sample.reduce((acc, l) => acc + (l.match(/,/g)?.length || 0), 0)
  const semis = sample.reduce((acc, l) => acc + (l.match(/;/g)?.length || 0), 0)
  return semis > commas ? ';' : ','
}

function splitDelimitedLine(line: string, delimiter: string): string[] {
  const out: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === delimiter && !inQuotes) {
      out.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  out.push(current)
  return out.map((cell) => cell.trim())
}

function parseDelimitedText(text: string): string[][] {
  const cleaned = text.replace(/^\uFEFF/, '').trim()
  if (!cleaned) return []
  const lines = cleaned.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  if (lines.length === 0) return []
  const delimiter = guessDelimiter(lines)
  return lines.map((line) => splitDelimitedLine(line, delimiter))
}

function detectHeaderRow(rows: string[][]): boolean {
  if (rows.length < 2) return true
  const first = rows[0]
  const second = rows[1]
  const firstNumeric = first.filter((c) => parseNumericValue(c) !== null).length
  const secondNumeric = second.filter((c) => parseNumericValue(c) !== null).length
  return firstNumeric === 0 && secondNumeric > 0
}

function buildSheetFromRows(rows: string[][], hasHeader: boolean, name: string, columnLabel = 'Coluna'): SheetData {
  const sanitized = rows.filter((r) => r.some((c) => String(c).trim() !== ''))
  if (sanitized.length === 0) return { name, rows: [], columns: [] }
  const header = hasHeader ? sanitized[0] : []
  const dataRows = hasHeader ? sanitized.slice(1) : sanitized
  const columnCount = Math.max(...sanitized.map((r) => r.length))
  const columns = hasHeader
    ? ensureUniqueColumns(header.concat(Array.from({ length: columnCount - header.length }, (_, i) => `${columnLabel} ${header.length + i + 1}`)), columnLabel)
    : ensureUniqueColumns(Array.from({ length: columnCount }, (_, i) => `${columnLabel} ${i + 1}`), columnLabel)
  const rowObjects = dataRows.map((row) => {
    const obj: Record<string, unknown> = {}
    columns.forEach((col, idx) => { obj[col] = row[idx] ?? '' })
    return obj
  })
  return { name, rows: rowObjects, columns }
}

/* ── Floating spreadsheet component ── */
function ChartSpreadsheet({ data, colors, chartType, onChange, onClose }: {
  data: ChartBlockConfig['data']
  colors: string[]
  chartType: ChartType
  onChange: (next: { data: ChartBlockConfig['data']; colors?: string[] }) => void
  onClose: () => void
}) {
  const { language } = useAppStore()
  const [activeTab, setActiveTab] = useState<'import' | 'manual'>('import')
  const [sheet, setSheet] = useState<SheetData | null>(null)
  const [rawRows, setRawRows] = useState<string[][] | null>(null)
  const [hasHeader, setHasHeader] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [status, setStatus] = useState<{ text: string; tone: 'info' | 'error' | 'success' } | null>(null)

  const labels = data?.labels || []
  const values = data?.values || []
  const values2 = data?.values2 || []
  const usesSecondSeries = chartType === 'stacked' || chartType === 'composed' || chartType === 'grouped'

  const [labelCol, setLabelCol] = useState('')
  const [valueCol, setValueCol] = useState('')
  const [value2Col, setValue2Col] = useState('')
  const [colorCol, setColorCol] = useState('')
  const [sortMode, setSortMode] = useState<'none' | 'valueDesc' | 'valueAsc' | 'labelAsc' | 'labelDesc'>('none')
  const [limitRows, setLimitRows] = useState(0)
  const [skipEmpty, setSkipEmpty] = useState(true)
  const [datasetLabel, setDatasetLabel] = useState(data?.datasetLabel || '')
  const [dataset2Label, setDataset2Label] = useState(data?.dataset2Label || '')

  useEffect(() => {
    setDatasetLabel(data?.datasetLabel || '')
    setDataset2Label(data?.dataset2Label || '')
  }, [data?.datasetLabel, data?.dataset2Label])

  useEffect(() => {
    if (!rawRows) return
    const nextSheet = buildSheetFromRows(rawRows, hasHeader, 'Area de transferencia', t(language, 'prop.columnLabel'))
    setSheet(nextSheet)
  }, [rawRows, hasHeader])

  useEffect(() => {
    if (!sheet || sheet.columns.length === 0) return
    const sample = sheet.rows.slice(0, 20)
    const numericScore = sheet.columns.reduce<Record<string, number>>((acc, col) => {
      acc[col] = sample.filter((row) => parseNumericValue(row[col]) !== null).length
      return acc
    }, {})
    const sortedNumeric = [...sheet.columns].sort((a, b) => numericScore[b] - numericScore[a])
    const bestValue = sortedNumeric[0] || sheet.columns[0]
    const bestValue2 = sortedNumeric[1] || ''
    const bestLabel = sheet.columns.find((c) => c !== bestValue && c !== bestValue2) || sheet.columns[0]
    setLabelCol(bestLabel)
    setValueCol(bestValue)
    if (usesSecondSeries && bestValue2) setValue2Col(bestValue2)
    if (!datasetLabel) setDatasetLabel(bestValue)
    if (usesSecondSeries && !dataset2Label) setDataset2Label(bestValue2)
  }, [sheet, usesSecondSeries, datasetLabel, dataset2Label])

  const showStatus = (text: string, tone: 'info' | 'error' | 'success' = 'info') => {
    setStatus({ text, tone })
    setTimeout(() => setStatus(null), 2800)
  }

  const handlePaste = () => {
    navigator.clipboard.readText().then((text) => {
      const rows = parseDelimitedText(text)
      if (rows.length === 0) {
        showStatus(t(language, 'prop.nothingToPaste'), 'error')
        return
      }
      setLabelCol('')
      setValueCol('')
      setValue2Col('')
      setColorCol('')
      const header = detectHeaderRow(rows)
      setHasHeader(header)
      setRawRows(rows)
      showStatus(t(language, 'prop.pasteLines', { count: rows.length }), 'success')
    }).catch(() => showStatus(t(language, 'common.pasteError'), 'error'))
  }

  const handleFile = async (file: File) => {
    setIsUploading(true)
    setLabelCol('')
    setValueCol('')
    setValue2Col('')
    setColorCol('')
    try {
      const result = await uploadApi.uploadFile(file)
      setSheet({ name: file.name, rows: result.data, columns: result.columns })
      setRawRows(null)
      setHasHeader(true)
      showStatus(`${result.row_count} linhas carregadas`, 'success')
    } catch (err: unknown) {
      showStatus(err instanceof Error ? err.message : t(language, 'common.importError'), 'error')
    } finally {
      setIsUploading(false)
    }
  }

  const dataPreview = useMemo(() => {
    if (!sheet || !valueCol) return { rows: [], total: 0, valid: 0 }
    const items = sheet.rows.map((row, idx) => {
      const label = labelCol === '__index'
        ? `Linha ${idx + 1}`
        : labelCol
          ? String(row[labelCol] ?? '')
          : `Linha ${idx + 1}`
      const value = parseNumericValue(row[valueCol])
      const value2 = value2Col ? parseNumericValue(row[value2Col]) : null
      const color = colorCol ? String(row[colorCol] ?? '').trim() : ''
      return { label, value, value2, color }
    })
    const filtered = skipEmpty
      ? items.filter((i) => i.value !== null && i.label !== '')
      : items
    const sorted = (() => {
      switch (sortMode) {
        case 'valueDesc':
          return [...filtered].sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
        case 'valueAsc':
          return [...filtered].sort((a, b) => (a.value ?? 0) - (b.value ?? 0))
        case 'labelAsc':
          return [...filtered].sort((a, b) => a.label.localeCompare(b.label))
        case 'labelDesc':
          return [...filtered].sort((a, b) => b.label.localeCompare(a.label))
        default:
          return filtered
      }
    })()
    const limited = limitRows > 0 ? sorted.slice(0, limitRows) : sorted
    const valid = limited.filter((i) => i.value !== null).length
    return { rows: limited, total: items.length, valid }
  }, [sheet, labelCol, valueCol, value2Col, colorCol, skipEmpty, sortMode, limitRows])

  const applyImport = () => {
    if (!sheet || !valueCol) return
    const rows = dataPreview.rows
    const nextLabels = rows.map((r) => r.label || t(language, 'chart.defaultItem', { count: Math.floor(Math.random() * 999) + 1 }))
    const nextValues = rows.map((r) => r.value ?? 0)
    const nextValues2 = usesSecondSeries && value2Col ? rows.map((r) => r.value2 ?? 0) : undefined
    const currentColorMap = new Map(labels.map((l, i) => [l, colors[i]]))
    const fallbackColors = nextLabels.map((label, i) => currentColorMap.get(label) || CHART_PALETTE[i % CHART_PALETTE.length])
    const nextColors = colorCol
      ? rows.map((r, i) => (r.color && r.color.startsWith('#') ? r.color : fallbackColors[i]))
      : fallbackColors
    const nextDataset2Label = usesSecondSeries
      ? (dataset2Label || value2Col || data?.dataset2Label || 'Série 2')
      : data?.dataset2Label
    onChange({
      data: {
        ...data,
        labels: nextLabels,
        values: nextValues,
        values2: usesSecondSeries ? nextValues2 : data?.values2,
        datasetLabel: datasetLabel || valueCol,
        dataset2Label: nextDataset2Label,
      },
      colors: nextColors,
    })
    showStatus(t(language, 'prop.dataApplied'), 'success')
    setActiveTab('manual')
  }

  const addRow = () => {
    const nextLabels = [...labels, t(language, 'chart.defaultItem', { count: labels.length + 1 })]
    const nextValues = [...values, 0]
    const nextValues2 = usesSecondSeries ? [...values2, 0] : values2
    const nextColors = [...colors, CHART_PALETTE[(nextLabels.length - 1) % CHART_PALETTE.length]]
    onChange({ data: { ...data, labels: nextLabels, values: nextValues, values2: nextValues2 }, colors: nextColors })
  }

  const removeRow = (i: number) => {
    const nextLabels = labels.filter((_, idx) => idx !== i)
    const nextValues = values.filter((_, idx) => idx !== i)
    const nextValues2 = usesSecondSeries ? values2.filter((_, idx) => idx !== i) : values2
    const nextColors = colors.filter((_, idx) => idx !== i)
    onChange({ data: { ...data, labels: nextLabels, values: nextValues, values2: nextValues2 }, colors: nextColors })
  }

  const updateRow = (i: number, field: 'label' | 'value' | 'value2' | 'color', raw: string) => {
    const nextLabels = [...labels]
    const nextValues = [...values]
    const nextValues2 = [...values2]
    const nextColors = [...colors]
    if (field === 'label') nextLabels[i] = raw
    else if (field === 'value') nextValues[i] = parseNumericValue(raw) ?? 0
    else if (field === 'value2') nextValues2[i] = parseNumericValue(raw) ?? 0
    else nextColors[i] = raw
    onChange({ data: { ...data, labels: nextLabels, values: nextValues, values2: nextValues2 }, colors: nextColors })
  }

  const columnOptions = sheet?.columns || []
  const labelOptions = [
    { value: '', label: 'Selecionar coluna' },
    { value: '__index', label: 'Nº da linha' },
    ...columnOptions.map((c) => ({ value: c, label: c })),
  ]
  const valueOptions = [
    { value: '', label: 'Selecionar coluna' },
    ...columnOptions.map((c) => ({ value: c, label: c })),
  ]

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
    }} onClick={onClose}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
        width: '92vw', maxWidth: 980, maxHeight: '84vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BarChart3 size={16} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t(language, 'prop.sheetName')}</span>
            <span style={{ fontSize: 11, color: 'var(--text-subtle)' }}>{t(language, 'prop.linesCurrent', { count: labels.length })}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {status && (
              <span style={{
                fontSize: 11,
                color: status.tone === 'error' ? '#ef4444' : status.tone === 'success' ? '#22c55e' : 'var(--accent)',
                fontWeight: 600,
              }}>
                {status.text}
              </span>
            )}
            <button onClick={handlePaste}
              style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-strong)', color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Clipboard size={12} /> {t(language, 'studio.paste')}
            </button>
            <button onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
              <X size={16} />
            </button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
          {(['import', 'manual'] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{
                fontSize: 11, fontWeight: 700, padding: '6px 12px', borderRadius: 8,
                border: `1px solid ${activeTab === tab ? 'var(--accent)' : 'var(--border)'}`,
                background: activeTab === tab ? 'var(--accent-soft)' : 'var(--surface-strong)',
                color: activeTab === tab ? 'var(--accent)' : 'var(--text-subtle)',
                cursor: 'pointer',
              }}>
              {tab === 'import' ? t(language, 'right.importData') : t(language, 'right.editManually')}
            </button>
          ))}
        </div>

        {activeTab === 'import' && (
          <div className="grid gap-4 md:grid-cols-[320px,1fr]" style={{ padding: '12px 16px', overflow: 'auto' }}>
            <div className="space-y-3">
              <div className="rounded-md border p-3 space-y-2" style={{ borderColor: 'var(--border)', background: 'var(--surface-strong)' }}>
                <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-subtle)' }}>{t(language, 'prop.sourceData')}</div>
                <DropZone
                  isDragging={isDragging}
                  isUploading={isUploading}
                  accept=".csv,.xlsx,.xls"
                  hint="CSV ou Excel"
                  compact
                  onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                  onDragLeave={() => setIsDragging(false)}
                  onFile={handleFile}
                />
                <button onClick={handlePaste}
                  className="w-full text-[11px] font-medium py-2 rounded-md border flex items-center justify-center gap-2 transition-colors"
                  style={{ borderColor: 'var(--border)', color: 'var(--text-subtle)', background: 'var(--surface)' }}>
                  <Clipboard size={13} /> {t(language, 'right.pasteClipboard')}
                </button>
                {sheet && (
                  <FileInfo
                    name={`${sheet.rows.length} linhas · ${sheet.columns.length} colunas`}
                    onClear={() => { setSheet(null); setRawRows(null); setLabelCol(''); setValueCol(''); setValue2Col(''); setColorCol('') }}
                  />
                )}
                {rawRows && (
                  <label className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-subtle)' }}>
                    <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} />
                    {t(language, 'right.firstRowHeader')}
                  </label>
                )}
              </div>

              <div className="rounded-md border p-3 space-y-2" style={{ borderColor: 'var(--border)', background: 'var(--surface-strong)' }}>
                <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-subtle)' }}>{t(language, 'prop.mapping')}</div>
                <Field label={t(language, 'prop.fieldLabel')}>
                  <SelectInput value={labelCol} onChange={(v) => setLabelCol(v)} options={labelOptions} />
                </Field>
                <Field label={t(language, 'prop.fieldValue')}>
                  <SelectInput value={valueCol} onChange={(v) => setValueCol(v)} options={valueOptions} />
                </Field>
                {usesSecondSeries && (
                  <Field label={t(language, 'prop.fieldValueB')}>
                    <SelectInput value={value2Col} onChange={(v) => setValue2Col(v)} options={valueOptions} />
                  </Field>
                )}
                <Field label={t(language, 'prop.fieldColor')}>
                  <SelectInput value={colorCol} onChange={(v) => setColorCol(v)} options={valueOptions} />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label={t(language, 'prop.seriesA')}><TextInput value={datasetLabel} onChange={(v) => setDatasetLabel(v)} placeholder="Ex: Receita" /></Field>
                  {usesSecondSeries && (
                    <Field label={t(language, 'prop.seriesB')}><TextInput value={dataset2Label} onChange={(v) => setDataset2Label(v)} placeholder="Ex: Meta" /></Field>
                  )}
                </div>
              </div>

              <div className="rounded-md border p-3 space-y-2" style={{ borderColor: 'var(--border)', background: 'var(--surface-strong)' }}>
                <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-subtle)' }}>{t(language, 'prop.settings')}</div>
                <Toggle value={skipEmpty} onChange={(v) => setSkipEmpty(v)} label={t(language, 'prop.skipEmpty')} />
                <Field label={t(language, 'prop.sort')}>
                  <SelectInput
                    value={sortMode}
                    onChange={(v) => setSortMode(v as any)}
                    options={[
                      { value: 'none', label: t(language, 'prop.sortNone') },
                      { value: 'valueDesc', label: t(language, 'prop.sortValueDesc') },
                      { value: 'valueAsc', label: t(language, 'prop.sortValueAsc') },
                      { value: 'labelAsc', label: t(language, 'prop.sortLabelAsc') },
                      { value: 'labelDesc', label: t(language, 'prop.sortLabelDesc') },
                    ]}
                  />
                </Field>
                <Field label={t(language, 'prop.limitRows')}><NumInput value={limitRows} onChange={(v) => setLimitRows(v)} min={0} max={500} /></Field>
              </div>

              <button onClick={applyImport}
                disabled={!sheet || !valueCol}
                className="w-full py-2 rounded-md text-sm font-semibold transition-all"
                style={{
                  background: !sheet || !valueCol ? 'var(--surface-muted)' : 'var(--accent)',
                  color: !sheet || !valueCol ? 'var(--text-muted)' : '#fff',
                  cursor: !sheet || !valueCol ? 'not-allowed' : 'pointer',
                }}>
                {t(language, 'prop.applyChart')}
              </button>
            </div>

            <div className="rounded-md border p-3" style={{ borderColor: 'var(--border)', background: 'var(--surface-strong)' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: 'var(--text-subtle)' }}>{t(language, 'prop.sheetPreview')}</div>
                {sheet && (
                  <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {t(language, 'prop.validValTotal', { valid: dataPreview.valid, total: dataPreview.total })}
                  </div>
                )}
              </div>
              {!sheet && (
                <div className="rounded-md border px-3 py-4 text-center text-[11px]"
                  style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-subtle)' }}>
                  {t(language, 'prop.importToView')}
                </div>
              )}
              {sheet && (
                <div style={{ maxHeight: 360, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: 'var(--surface)' }}>
                        {sheet.columns.map((col) => {
                          const highlight = col === valueCol
                            ? 'rgba(34,197,94,0.14)'
                            : col === value2Col
                              ? 'rgba(234,179,8,0.14)'
                              : col === labelCol
                                ? 'rgba(59,130,246,0.14)'
                                : col === colorCol
                                  ? 'rgba(20,184,166,0.14)'
                                  : 'transparent'
                          return (
                            <th key={col} style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid var(--border)', background: highlight, color: 'var(--text-subtle)', fontWeight: 600 }}>
                              {col}
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {sheet.rows.slice(0, 30).map((row, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          {sheet.columns.map((col) => {
                            const highlight = col === valueCol
                              ? 'rgba(34,197,94,0.08)'
                              : col === value2Col
                                ? 'rgba(234,179,8,0.08)'
                                : col === labelCol
                                  ? 'rgba(59,130,246,0.08)'
                                  : col === colorCol
                                    ? 'rgba(20,184,166,0.08)'
                                    : 'transparent'
                            return (
                              <td key={`${col}-${idx}`} style={{ padding: '6px 8px', background: highlight, color: 'var(--text)' }}>
                                {String(row[col] ?? '')}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'manual' && (
          <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px 16px' }}>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <Field label={t(language, 'prop.seriesA')}><TextInput value={datasetLabel} onChange={(v) => { setDatasetLabel(v); onChange({ data: { ...data, datasetLabel: v }, colors }) }} placeholder={t(language, 'prop.seriesA')} /></Field>
              {usesSecondSeries && (
                <Field label={t(language, 'prop.seriesB')}><TextInput value={dataset2Label} onChange={(v) => { setDataset2Label(v); onChange({ data: { ...data, dataset2Label: v }, colors }) }} placeholder={t(language, 'prop.seriesB')} /></Field>
              )}
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '6px 4px', textAlign: 'left', color: 'var(--text-subtle)', fontWeight: 600, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>#</th>
                  <th style={{ padding: '6px 4px', textAlign: 'left', color: 'var(--text-subtle)', fontWeight: 600, fontSize: 10 }}>{t(language, 'points.color')}</th>
                  <th style={{ padding: '6px 4px', textAlign: 'left', color: 'var(--text-subtle)', fontWeight: 600, fontSize: 10 }}>{t(language, 'prop.fieldLabel')}</th>
                  <th style={{ padding: '6px 4px', textAlign: 'right', color: 'var(--text-subtle)', fontWeight: 600, fontSize: 10 }}>{t(language, 'prop.fieldValue')}</th>
                  {usesSecondSeries && (
                    <th style={{ padding: '6px 4px', textAlign: 'right', color: 'var(--text-subtle)', fontWeight: 600, fontSize: 10 }}>{t(language, 'prop.fieldValueB')}</th>
                  )}
                  <th style={{ width: 30 }}></th>
                </tr>
              </thead>
              <tbody>
                {labels.map((label, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '4px', color: 'var(--text-subtle)', fontSize: 10 }}>{i + 1}</td>
                    <td style={{ padding: '4px' }}>
                      <input type="color" value={colors[i]?.startsWith('#') ? colors[i] : '#2563eb'}
                        onChange={(e) => updateRow(i, 'color', e.target.value)}
                        style={{ width: 28, height: 22, border: 'none', borderRadius: 4, padding: 0, cursor: 'pointer' }} />
                    </td>
                    <td style={{ padding: '4px' }}>
                      <input type="text" value={label} onChange={(e) => updateRow(i, 'label', e.target.value)}
                        style={{ width: '100%', background: 'var(--surface-strong)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', color: 'var(--text)', fontSize: 12 }} />
                    </td>
                    <td style={{ padding: '4px' }}>
                      <input type="number" value={values[i] ?? 0} onChange={(e) => updateRow(i, 'value', e.target.value)}
                        style={{ width: '100%', background: 'var(--surface-strong)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', color: 'var(--text)', fontSize: 12, textAlign: 'right' }} />
                    </td>
                    {usesSecondSeries && (
                      <td style={{ padding: '4px' }}>
                        <input type="number" value={values2[i] ?? 0} onChange={(e) => updateRow(i, 'value2', e.target.value)}
                          style={{ width: '100%', background: 'var(--surface-strong)', border: '1px solid var(--border)', borderRadius: 4, padding: '4px 8px', color: 'var(--text)', fontSize: 12, textAlign: 'right' }} />
                      </td>
                    )}
                    <td style={{ padding: '4px' }}>
                      <button onClick={() => removeRow(i)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', padding: 2 }}>
                        <MinusIcon size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={addRow}
              className="w-full text-[11px] font-medium py-2 mt-2 rounded-md border border-dashed flex items-center justify-center gap-1.5 transition-colors"
              style={{ borderColor: 'var(--border)', color: 'var(--text-subtle)' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-subtle)' }}>
              <Plus size={11} /> {t(language, 'prop.addRow')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

interface ChartTypeDef {
  id: ChartType
  label: string
  desc: string
  horizontal?: boolean
  thumb: React.ReactNode
}

function getChartTypes(language: Language): ChartTypeDef[] {
  return [
    { id: 'bar', label: t(language, 'chart.type.bar'), desc: t(language, 'chart.desc.bar'),
      thumb: (<svg viewBox="0 0 56 40" fill="currentColor"><rect x="5"  y="22" width="9" height="18" opacity="0.5"/><rect x="17" y="12" width="9" height="28" /><rect x="29" y="17" width="9" height="23" opacity="0.75"/><rect x="41" y="6"  width="9" height="34" opacity="0.9"/></svg>),
    },
    { id: 'bar', label: t(language, 'chart.type.barH'), desc: t(language, 'chart.desc.barH'), horizontal: true,
      thumb: (<svg viewBox="0 0 56 40" fill="currentColor"><rect x="8" y="4"  width="18" height="7" opacity="0.5"/><rect x="8" y="14" width="38" height="7" /><rect x="8" y="24" width="28" height="7" opacity="0.75"/><rect x="8" y="34" width="14" height="7" opacity="0.5"/></svg>),
    },
    { id: 'line', label: t(language, 'chart.type.line'), desc: t(language, 'chart.desc.line'),
      thumb: (<svg viewBox="0 0 56 40" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="4,32 14,24 24,26 34,10 44,18 52,14"/><circle cx="4"  cy="32" r="2.5" fill="currentColor" stroke="none"/><circle cx="14" cy="24" r="2.5" fill="currentColor" stroke="none"/><circle cx="24" cy="26" r="2.5" fill="currentColor" stroke="none"/><circle cx="34" cy="10" r="2.5" fill="currentColor" stroke="none"/><circle cx="44" cy="18" r="2.5" fill="currentColor" stroke="none"/><circle cx="52" cy="14" r="2.5" fill="currentColor" stroke="none"/></svg>),
    },
    { id: 'area', label: t(language, 'chart.type.area'), desc: t(language, 'chart.desc.area'),
      thumb: (<svg viewBox="0 0 56 40"><polygon points="4,38 4,30 14,22 24,24 34,8 44,16 52,12 52,38" fill="currentColor" opacity="0.25"/><polyline points="4,30 14,22 24,24 34,8 44,16 52,12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>),
    },
    { id: 'pie', label: t(language, 'chart.type.pie'), desc: t(language, 'chart.desc.pie'),
      thumb: (<svg viewBox="0 0 56 40"><circle cx="28" cy="20" r="16" fill="none" stroke="currentColor" strokeWidth="16" strokeDasharray="20 80" strokeDashoffset="0" opacity="0.4" transform="rotate(-90 28 20)"/><circle cx="28" cy="20" r="16" fill="none" stroke="currentColor" strokeWidth="16" strokeDasharray="35 65" strokeDashoffset="-20" opacity="0.7" transform="rotate(-90 28 20)"/><circle cx="28" cy="20" r="16" fill="none" stroke="currentColor" strokeWidth="16" strokeDasharray="45 55" strokeDashoffset="-55" opacity="1" transform="rotate(-90 28 20)"/></svg>),
    },
    { id: 'donut', label: t(language, 'chart.type.donut'), desc: t(language, 'chart.desc.donut'),
      thumb: (<svg viewBox="0 0 56 40"><circle cx="28" cy="20" r="14" fill="none" stroke="currentColor" strokeWidth="8" strokeDasharray="22 66" strokeDashoffset="0" opacity="0.4" transform="rotate(-90 28 20)"/><circle cx="28" cy="20" r="14" fill="none" stroke="currentColor" strokeWidth="8" strokeDasharray="30 58" strokeDashoffset="-22" opacity="0.7" transform="rotate(-90 28 20)"/><circle cx="28" cy="20" r="14" fill="none" stroke="currentColor" strokeWidth="8" strokeDasharray="36 52" strokeDashoffset="-52" opacity="1" transform="rotate(-90 28 20)"/></svg>),
    },
    { id: 'radial', label: t(language, 'chart.type.radial'), desc: t(language, 'chart.desc.radial'),
      thumb: (<svg viewBox="0 0 56 40"><circle cx="28" cy="20" r="16" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="28 100" opacity="0.45" transform="rotate(-90 28 20)" strokeLinecap="round"/><circle cx="28" cy="20" r="11" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="36 100" opacity="0.7" transform="rotate(-90 28 20)" strokeLinecap="round"/><circle cx="28" cy="20" r="6" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="24 100" transform="rotate(-90 28 20)" strokeLinecap="round"/></svg>),
    },
    { id: 'stacked', label: t(language, 'chart.type.stacked'), desc: t(language, 'chart.desc.stacked'),
      thumb: (<svg viewBox="0 0 56 40" fill="currentColor"><rect x="6" y="22" width="9" height="18" /><rect x="6" y="12" width="9" height="10" opacity="0.5"/><rect x="18" y="16" width="9" height="24" /><rect x="18" y="6"  width="9" height="10" opacity="0.5"/><rect x="30" y="20" width="9" height="20" /><rect x="30" y="10" width="9" height="10" opacity="0.5"/><rect x="42" y="14" width="9" height="26" /><rect x="42" y="4"  width="9" height="10" opacity="0.5"/></svg>),
    },
    { id: 'composed', label: t(language, 'chart.type.composed'), desc: t(language, 'chart.desc.composed'),
      thumb: (<svg viewBox="0 0 56 40"><rect x="6"  y="22" width="9" height="18" fill="currentColor" opacity="0.55"/><rect x="18" y="14" width="9" height="26" fill="currentColor" opacity="0.55"/><rect x="30" y="18" width="9" height="22" fill="currentColor" opacity="0.55"/><rect x="42" y="10" width="9" height="30" fill="currentColor" opacity="0.55"/><polyline points="10,18 22,8 34,12 46,4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><circle cx="10" cy="18" r="2" fill="currentColor"/><circle cx="22" cy="8"  r="2" fill="currentColor"/><circle cx="34" cy="12" r="2" fill="currentColor"/><circle cx="46" cy="4"  r="2" fill="currentColor"/></svg>),
    },
    { id: 'scatter', label: t(language, 'chart.type.scatter'), desc: t(language, 'chart.desc.scatter'),
      thumb: (<svg viewBox="0 0 56 40" fill="currentColor"><circle cx="8"  cy="30" r="3" opacity="0.5"/><circle cx="18" cy="18" r="3" opacity="0.7"/><circle cx="28" cy="24" r="3" opacity="0.55"/><circle cx="38" cy="8"  r="3" opacity="0.9"/><circle cx="48" cy="16" r="3" opacity="0.65"/></svg>),
    },
    { id: 'treemap', label: t(language, 'chart.type.treemap'), desc: t(language, 'chart.desc.treemap'),
      thumb: (<svg viewBox="0 0 56 40" fill="currentColor" stroke="rgba(255,255,255,0.12)" strokeWidth="0.5"><rect x="2" y="2"  width="32" height="22" opacity="0.8"/><rect x="36" y="2"  width="18" height="10" opacity="0.55"/><rect x="36" y="14" width="18" height="10" opacity="0.45"/><rect x="2" y="26" width="18" height="12" opacity="0.65"/><rect x="22" y="26" width="32" height="12" opacity="0.35"/></svg>),
    },
    { id: 'funnel', label: t(language, 'chart.type.funnel'), desc: t(language, 'chart.desc.funnel'),
      thumb: (<svg viewBox="0 0 56 40" fill="currentColor"><polygon points="4,6 52,6 46,14 10,14" opacity="0.85"/><polygon points="10,16 46,16 40,24 16,24" opacity="0.6"/><polygon points="16,26 40,26 34,34 22,34" opacity="0.4"/></svg>),
    },
    { id: 'radar', label: t(language, 'chart.type.radar'), desc: t(language, 'chart.desc.radar'),
      thumb: (<svg viewBox="0 0 56 40" fill="none" stroke="currentColor"><polygon points="28,4 48,16 42,36 14,36 8,16" strokeOpacity="0.3" strokeWidth="0.5"/><polygon points="28,10 42,18 38,32 18,32 14,18" strokeWidth="1.5" fill="currentColor" fillOpacity="0.2"/><circle cx="28" cy="10" r="2" fill="currentColor"/><circle cx="42" cy="18" r="2" fill="currentColor"/><circle cx="38" cy="32" r="2" fill="currentColor"/><circle cx="18" cy="32" r="2" fill="currentColor"/><circle cx="14" cy="18" r="2" fill="currentColor"/></svg>),
    },
    { id: 'grouped', label: t(language, 'chart.type.grouped'), desc: t(language, 'chart.desc.grouped'),
      thumb: (<svg viewBox="0 0 56 40" fill="currentColor"><rect x="4" y="20" width="6" height="20" opacity="0.7"/><rect x="12" y="12" width="6" height="28" opacity="0.5"/><rect x="20" y="24" width="6" height="16" opacity="0.7"/><rect x="28" y="14" width="6" height="26" opacity="0.5"/><rect x="36" y="28" width="6" height="12" opacity="0.7"/><rect x="44" y="8" width="6" height="32" opacity="0.5"/></svg>),
    },
  ]
}

const BLOCK_ICON: Record<BlockType, React.ElementType> = {
  map: MapIcon,
  card: CreditCard,
  text: Type,
  chart: BarChart3,
  table: Table,
  shape: Shapes,
  connector: ArrowRight,
  divider: Minus,
  image: Image,
  timeline: Layers,
  minimap: MapIcon,
}

function getFriendlyName(b: Block, allBlocks: Block[], labels: Record<string, string>): string {
  if (b.type === 'map') {
    const cfg = b.config as any
    if (cfg?.name) return cfg.name
    const idx = allBlocks.filter((x) => x.type === 'map').indexOf(b) + 1
    return `${labels.map} ${idx}`
  }
  const typeBlocks = allBlocks.filter((x) => x.type === b.type)
  const idx = typeBlocks.indexOf(b) + 1
  const typeLabels: Record<string, string> = {
    card: labels.card, text: labels.text, chart: labels.chart, table: labels.table,
    shape: labels.shape, connector: labels.connector, divider: labels.divider, image: labels.image,
    timeline: labels.timeline, minimap: labels.minimap,
  }
  return `${typeLabels[b.type] || b.type} ${idx}`
}

export default function StudioRightPanel() {
  const { spec, selectedBlockId, selectBlock, updateBlock, addBlock, removeBlock } = useStudioStore()
  const { language } = useAppStore()
  const [activeTab, setActiveTab] = useState<'add' | 'properties'>('add')
  const [cardPickerOpen, setCardPickerOpen] = useState(false)
  const [chartPickerOpen, setChartPickerOpen] = useState(false)
  const [shapePickerOpen, setShapePickerOpen] = useState(false)

  const blockLabels = {
    map: t(language, 'left.map'),
    card: t(language, 'right.card'),
    text: t(language, 'right.text'),
    chart: t(language, 'right.chart'),
    table: t(language, 'right.table'),
    shape: t(language, 'right.shape'),
    connector: t(language, 'right.arrow'),
    divider: t(language, 'right.divider'),
    image: t(language, 'right.image'),
    timeline: t(language, 'right.timeline'),
    minimap: t(language, 'right.minimap'),
  }

  const blockTools: { type: BlockType; label: string; icon: React.ReactNode }[] = [
    { type: 'map', label: blockLabels.map, icon: <MapIcon size={15} /> },
    { type: 'card', label: blockLabels.card, icon: <CreditCard size={15} /> },
    { type: 'text', label: blockLabels.text, icon: <Type size={15} /> },
    { type: 'chart', label: blockLabels.chart, icon: <BarChart3 size={15} /> },
    { type: 'table', label: blockLabels.table, icon: <Table size={15} /> },
    { type: 'shape', label: blockLabels.shape, icon: <Shapes size={15} /> },
    { type: 'connector', label: blockLabels.connector, icon: <ArrowRight size={15} /> },
    { type: 'divider', label: blockLabels.divider, icon: <Minus size={15} /> },
    { type: 'image', label: blockLabels.image, icon: <Image size={15} /> },
  ]

  const selectedBlock = useMemo(() => {
    if (!spec || !selectedBlockId) return null
    return spec.blocks.find((b) => b.id === selectedBlockId) || null
  }, [spec, selectedBlockId])

  useEffect(() => {
    if (selectedBlockId) setActiveTab('properties')
  }, [selectedBlockId])

  const insertBlock = useCallback((type: BlockType, extraConfig: Record<string, unknown> = {}) => {
    if (!spec) return
    const id = `${type}-${Date.now()}`
    const existing = spec.blocks
    const rightmost = existing.length > 0 ? Math.max(...existing.map((b) => b.bounds.x + b.bounds.w)) : 0
    const x = rightmost >= 1100 ? 20 : rightmost + 20
    const y = 20

    const mapCount = existing.filter((b) => b.type === 'map').length
    let config: Record<string, unknown> = {}
    switch (type) {
      case 'map':
        config = {
          name: t(language, 'map.defaultName', { count: mapCount + 1 }),
          area: { type: 'brasil' },
          basemap: 'none', fillColor: '#2d3742', borderColor: '#7a8a9a',
          borderWidth: 1, fillOpacity: 0.85, markerColor: '#d9822b', markerSize: 8,
          featureColors: {}, showStateLabels: true,
          stateLabelColor: '#ffffff', stateLabelSize: 12,
        }
        break
      case 'card':
        config = { template: 'stat', title: 'INDICADOR', value: '0',
          subtitle: '↑ 0%', color: '#2563eb', showAccentBar: true, rounded: 10 }
        break
      case 'text':
        config = { content: t(language, 'text.defaultContent'), fontSize: 18, alignment: 'left', backgroundColor: 'transparent', backgroundStyle: 'none', bodyColor: 'var(--text)' }
        break
      case 'chart':
        config = {
          chartType: 'bar', title: '', subtitle: '',
          data: { labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai'], values: [42, 78, 55, 91, 63] },
          colors: [], showGrid: true, showValues: false, showLegend: false,
          backgroundColor: 'transparent', textColor: '#c8d4e0',
          curved: true, rounded: true,
        }
        break
      case 'table':
        config = { template: 'editorial', title: 'Tabela',
          columns: [{ key: 'col1', label: 'Item', align: 'left' }, { key: 'col2', label: 'Valor', align: 'right', format: 'number' }],
          rows: [{ col1: 'Item 1', col2: 100 }, { col1: 'Item 2', col2: 200 }],
          showHeader: true, accentColor: 'var(--accent)' }
        break
      case 'connector':
        config = {
          fromAnchor: { x: 100, y: 100 }, toAnchor: { x: 300, y: 200 },
          style: 'curved', color: 'var(--accent)', strokeWidth: 2,
          startMarker: 'none', endMarker: 'arrow',
          startMarkerSize: 1, endMarkerSize: 1,
          shadow: true, curvature: 0.5, bow: 0.4,
          dashPattern: 'solid', opacity: 1,
        }
        break
      case 'divider':
        config = { orientation: 'horizontal', color: 'var(--border)', thickness: 1, style: 'solid' }
        break
      case 'image':
        config = { src: '', fit: 'cover', mask: 'none',
          brightness: 100, contrast: 100, saturation: 100, grayscale: 0, blur: 0 }
        break
      case 'shape':
        config = { shape: 'rectangle', fillColor: 'var(--accent)', strokeColor: 'transparent', strokeWidth: 0, opacity: 1, rounded: 8, rotation: 0, shadow: false }
        break
    }

    const newBlock: Block = {
      id,
      type,
      bounds: {
        x, y,
        w: type === 'connector' || type === 'divider' ? 200
          : type === 'card' ? 240
          : type === 'text' ? 280
          : type === 'shape' ? 120
          : 320,
        h: type === 'card' ? 110
          : type === 'text' ? 120
          : type === 'divider' ? 20
          : type === 'connector' ? 60
          : type === 'shape' ? 120
          : 220,
      },
      config: { ...config, ...extraConfig },
      zIndex: existing.length,
    }

    addBlock(newBlock)
    selectBlock(id)
    setActiveTab('properties')
  }, [spec, addBlock, selectBlock])

  const handleAddBlock = (type: BlockType) => {
    if (type === 'card') {
      setCardPickerOpen(true)
    } else if (type === 'chart') {
      setChartPickerOpen(true)
    } else if (type === 'shape') {
      setShapePickerOpen(true)
    } else {
      insertBlock(type)
    }
  }

  const handleDeleteBlock = () => {
    if (!selectedBlockId) return
    removeBlock(selectedBlockId)
    selectBlock(null)
  }

  const handleDeleteBlockById = (id: string) => {
    removeBlock(id)
    if (selectedBlockId === id) selectBlock(null)
  }

  const duplicateBlock = useCallback(() => {
    if (!spec || !selectedBlockId) return
    const block = spec.blocks.find((b) => b.id === selectedBlockId)
    if (!block) return
    const newId = `${block.type}-${Date.now()}`
    const newBlock: Block = {
      ...block,
      id: newId,
      bounds: { ...block.bounds, x: block.bounds.x + 20, y: block.bounds.y + 20 },
      zIndex: spec.blocks.length,
    }
    addBlock(newBlock)
    selectBlock(newId)
  }, [spec, selectedBlockId, addBlock, selectBlock])

  const bringForward = useCallback(() => {
    if (!spec || !selectedBlockId) return
    const maxZ = Math.max(...spec.blocks.map((b) => b.zIndex ?? 0))
    updateBlock(selectedBlockId, { zIndex: maxZ + 1 })
  }, [spec, selectedBlockId, updateBlock])

  const sendBackward = useCallback(() => {
    if (!spec || !selectedBlockId) return
    const minZ = Math.min(...spec.blocks.map((b) => b.zIndex ?? 0))
    updateBlock(selectedBlockId, { zIndex: minZ - 1 })
  }, [spec, selectedBlockId, updateBlock])

  // Ctrl+D to duplicate
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault()
        duplicateBlock()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [duplicateBlock])

  const updateConfig = useCallback((path: string, value: unknown) => {
    const { spec } = useStudioStore.getState()
    if (!selectedBlockId) return
    const block = spec?.blocks.find(b => b.id === selectedBlockId)
    if (!block) return
    const keys = path.split('.')
    const newConfig = { ...block.config as Record<string, unknown> }
    let target = newConfig as Record<string, unknown>
    for (let i = 0; i < keys.length - 1; i++) {
      target[keys[i]] = { ...(target[keys[i]] as Record<string, unknown>) }
      target = target[keys[i]] as Record<string, unknown>
    }
    target[keys[keys.length - 1]] = value
    updateBlock(block.id, { config: newConfig })
  }, [selectedBlockId, updateBlock])

  const updateBounds = (key: 'x' | 'y' | 'w' | 'h', value: number) => {
    if (!selectedBlock) return
    updateBlock(selectedBlock.id, { bounds: { ...selectedBlock.bounds, [key]: value } })
  }

  return (
    <>
      {/* ── Chart type picker overlay ── */}
      <AnimatePresence>
        {chartPickerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 9000,
              background: 'rgba(5,12,22,0.72)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(4px)',
            }}
            onClick={() => setChartPickerOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 8 }}
              transition={{ type: 'spring', damping: 24, stiffness: 380 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 480,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 14,
                overflow: 'hidden',
                boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
              }}
            >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 20px 12px',
        borderBottom: '1px solid var(--border)',
      }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t(language, 'picker.chart.title')}</div>
          <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 2 }}>{t(language, 'picker.chart.subtitle')}</div>
        </div>
                <button
                  onClick={() => setChartPickerOpen(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', padding: 4 }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Chart grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, padding: 16 }}>
                {getChartTypes(language).map((ct, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      insertBlock('chart', {
                        chartType: ct.id,
                        horizontal: ct.horizontal || false,
                      })
                      setChartPickerOpen(false)
                    }}
                    style={{
                      background: 'var(--surface-strong)',
                      border: '1.5px solid var(--border)',
                      borderRadius: 10,
                      padding: '12px 10px 8px',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 6,
                      transition: 'all 0.12s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--accent)'
                      e.currentTarget.style.background = 'var(--accent-soft)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border)'
                      e.currentTarget.style.background = 'var(--surface-strong)'
                    }}
                  >
                    <div style={{ width: 56, height: 40, color: 'var(--accent)', flexShrink: 0 }}>
                      {ct.thumb}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>{ct.label}</div>
                    <div style={{ fontSize: 9, color: 'var(--text-subtle)', textAlign: 'center', lineHeight: 1.3 }}>{ct.desc}</div>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Card picker overlay ── */}
      <AnimatePresence>
        {cardPickerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 9000,
              background: 'rgba(5,12,22,0.72)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(4px)',
            }}
            onClick={() => setCardPickerOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 8 }}
              transition={{ type: 'spring', damping: 24, stiffness: 380 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 700,
                maxWidth: '94vw',
                maxHeight: '86vh',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 14,
                boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 20px 12px',
                borderBottom: '1px solid var(--border)',
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t(language, 'picker.card.title')}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 2 }}>{t(language, 'picker.card.subtitle')}</div>
                </div>
                <button
                  onClick={() => setCardPickerOpen(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', padding: 4 }}
                >
                  <X size={16} />
                </button>
              </div>

              <div style={{ padding: '16px 18px 20px', overflowY: 'auto' }}>
                {getCardCategories(language).map((cat) => {
                  const presets = CARD_PRESETS.filter((p) => p.category === cat.id)
                  if (presets.length === 0) return null
                  return (
                    <div key={cat.id} style={{ marginBottom: 18 }}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-subtle)' }}>{cat.label}</div>
                        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{cat.hint}</div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                        {presets.map((preset) => (
                          <button
                            key={preset.id}
                            onClick={() => {
                              insertBlock('card', { template: preset.template, ...preset.config })
                              setCardPickerOpen(false)
                            }}
                            style={{
                              background: 'var(--surface-strong)',
                              border: '1.5px solid var(--border)',
                              borderRadius: 12,
                              padding: 10,
                              cursor: 'pointer',
                              display: 'flex', flexDirection: 'column', gap: 8,
                              transition: 'all 0.12s',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = 'var(--accent)'
                              e.currentTarget.style.background = 'var(--accent-soft)'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = 'var(--border)'
                              e.currentTarget.style.background = 'var(--surface-strong)'
                            }}
                          >
                            <CardThumb preset={preset} />
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>{preset.label}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Shape picker overlay ── */}
      <AnimatePresence>
        {shapePickerOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed', inset: 0, zIndex: 9000,
              background: 'rgba(5,12,22,0.72)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              backdropFilter: 'blur(4px)',
            }}
            onClick={() => setShapePickerOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 8 }}
              transition={{ type: 'spring', damping: 24, stiffness: 380 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 520,
                maxWidth: '92vw',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 14,
                boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
              }}
            >
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 20px 12px',
                borderBottom: '1px solid var(--border)',
              }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t(language, 'picker.shape.title')}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-subtle)', marginTop: 2 }}>{t(language, 'picker.shape.subtitle')}</div>
                </div>
                <button
                  onClick={() => setShapePickerOpen(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', padding: 4 }}
                >
                  <X size={16} />
                </button>
              </div>

              <div style={{ padding: 16 }}>
                {getShapeCategories(language).map((cat) => {
                  const shapes = getShapeTypes(language).filter((s) => SHAPE_CATEGORY_MAP[s.id] === cat.id)
                  if (shapes.length === 0) return null
                  return (
                    <div key={cat.id} style={{ marginBottom: 14 }}>
                      <div className="text-[9px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-subtle)' }}>{cat.label}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
                        {shapes.map((s) => (
                          <button
                            key={s.id}
                            onClick={() => {
                              insertBlock('shape', { shape: s.id })
                              setShapePickerOpen(false)
                            }}
                            style={{
                              background: 'var(--surface-strong)',
                              border: '1.5px solid var(--border)',
                              borderRadius: 12,
                              padding: '10px 8px 8px',
                              cursor: 'pointer',
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                              transition: 'all 0.12s',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = 'var(--accent)'
                              e.currentTarget.style.background = 'var(--accent-soft)'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = 'var(--border)'
                              e.currentTarget.style.background = 'var(--surface-strong)'
                            }}
                          >
                            <ShapeThumb shape={s.id} />
                            <div style={{ fontSize: 10, color: 'var(--text-subtle)', fontWeight: 600 }}>{s.label}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Panel ── */}
      <aside
        className="flex flex-col h-full flex-none"
        style={{ width: 260, background: 'var(--surface)', borderLeft: '1px solid var(--border)' }}
      >
        {/* Layers list */}
        {spec && spec.blocks.length > 0 && (
          <div className="flex-none border-b border-[var(--border)]" style={{ maxHeight: 160 }}>
            <div className="text-[10px] font-semibold uppercase tracking-wider px-3 pt-2 pb-1" style={{ color: 'var(--text-subtle)' }}>{t(language, 'right.layers')}</div>
            <div className="px-2 pb-2 overflow-y-auto custom-scrollbar space-y-0.5" style={{ maxHeight: 130 }}>
              {spec.blocks.slice().sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0)).map((b) => {
                const isSel = selectedBlockId === b.id
                const friendly = getFriendlyName(b, spec.blocks, blockLabels)
                const Icon = BLOCK_ICON[b.type] || Layers
                return (
                  <div key={b.id}
                    onClick={() => selectBlock(b.id)}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer transition-colors"
                    style={{
                      background: isSel ? 'var(--accent-soft)' : 'transparent',
                      color: isSel ? 'var(--accent)' : 'var(--text-muted)',
                    }}
                    onMouseEnter={(e) => { if (!isSel) { e.currentTarget.style.background = 'var(--surface-strong)'; e.currentTarget.style.color = 'var(--text)' } }}
                    onMouseLeave={(e) => { if (!isSel) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' } }}
                  >
                    <Icon size={12} />
                    <span className="flex-1 text-[11px] font-medium truncate">{friendly}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteBlockById(b.id) }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: 'var(--text-subtle)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-subtle)' }}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex-none flex border-b border-[var(--border)]">
          {[
            { id: 'add' as const, label: t(language, 'right.blocks'), icon: Layers },
            { id: 'properties' as const, label: t(language, 'right.properties'), icon: SlidersHorizontal },
          ].map((tab) => {
            const isActive = activeTab === tab.id
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="relative flex-1 flex items-center justify-center gap-1.5 text-[11px] font-semibold py-2 transition-all"
                style={{
                  color: isActive ? 'var(--accent-strong)' : 'var(--text-muted)',
                  background: isActive ? 'var(--accent-soft)' : 'transparent',
                }}
                onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.background = 'var(--surface-strong)'; e.currentTarget.style.color = 'var(--text)' } }}
                onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)' } }}
              >
                {isActive && (
                  <motion.div layoutId="rightPanelTab" className="absolute inset-0" transition={{ type: 'spring', damping: 22, stiffness: 350 }}
                    style={{ background: 'var(--accent-soft)', opacity: 0.4 }} />
                )}
                <Icon size={12} className="relative z-10" />
                <span className="relative z-10">{tab.label}</span>
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
          <AnimatePresence mode="wait">
            {activeTab === 'add' && (
              <motion.div key="add" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="space-y-3">
                <div className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-subtle)' }}>{t(language, 'right.elements')}</div>
                <div className="grid grid-cols-2 gap-2">
                  {blockTools.map((t) => (
                    <button
                      key={`${t.type}-${t.label}`}
                      onClick={() => handleAddBlock(t.type)}
                      className="flex flex-col items-center gap-1.5 rounded-lg border p-3 text-[11px] font-medium transition-all"
                      style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'var(--accent-soft)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.background = 'var(--surface-strong)' }}
                    >
                      {t.icon}
                      <span>{t.label}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'properties' && selectedBlock && (
              <motion.div key="props" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="space-y-4">
                {/* Block header */}
                <div className="flex items-center justify-between pb-2 border-b border-[var(--border)]">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
                      style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                      {selectedBlock.type}
                    </span>
                    <span className="text-[11px] font-medium" style={{ color: 'var(--text-muted)' }}>
                      {getFriendlyName(selectedBlock, spec?.blocks || [], blockLabels)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={sendBackward} title="Send backward"
                      className="inline-flex items-center justify-center rounded-md transition-colors"
                      style={{ width: 22, height: 22, color: 'var(--text-subtle)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.background = 'var(--surface-strong)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-subtle)'; e.currentTarget.style.background = 'transparent' }}>
                      <MinusIcon size={12} />
                    </button>
                    <button onClick={bringForward} title="Bring forward"
                      className="inline-flex items-center justify-center rounded-md transition-colors"
                      style={{ width: 22, height: 22, color: 'var(--text-subtle)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.background = 'var(--surface-strong)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-subtle)'; e.currentTarget.style.background = 'transparent' }}>
                      <Plus size={12} />
                    </button>
                    <button onClick={duplicateBlock} title="Duplicate (Ctrl+D)"
                      className="inline-flex items-center justify-center rounded-md transition-colors"
                      style={{ width: 22, height: 22, color: 'var(--text-subtle)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.background = 'var(--surface-strong)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-subtle)'; e.currentTarget.style.background = 'transparent' }}>
                      <CreditCard size={12} />
                    </button>
                    <button onClick={handleDeleteBlock}
                      className="inline-flex items-center justify-center rounded-md transition-colors"
                      style={{ width: 22, height: 22, color: 'var(--text-subtle)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'rgba(239,68,68,0.1)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-subtle)'; e.currentTarget.style.background = 'transparent' }}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>

                {/* Bounds */}
                <Section label={t(language, 'prop.position')}>
                  <div className="grid grid-cols-2 gap-2">
                    {(['x', 'y', 'w', 'h'] as const).map((k) => (
                      <div key={k} className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono w-3 text-center" style={{ color: 'var(--text-subtle)' }}>{k}</span>
                        <input type="number" value={selectedBlock.bounds[k]}
                          onChange={(e) => updateBounds(k, parseInt(e.target.value) || 0)}
                          className="flex-1 text-xs rounded-md border px-2 py-1 outline-none focus:border-[var(--accent)] transition-colors"
                          style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)', color: 'var(--text)' }} />
                      </div>
                    ))}
                  </div>
                </Section>

                {selectedBlock.type === 'map' && <MapProperties config={selectedBlock.config as MapBlockConfig} onChange={updateConfig} />}
                {selectedBlock.type === 'card' && <CardProperties config={selectedBlock.config as CardBlockConfig} onChange={updateConfig} />}
                {selectedBlock.type === 'text' && <TextProperties config={selectedBlock.config as TextBlockConfig} onChange={updateConfig} />}
                {selectedBlock.type === 'chart' && (
                  <ChartProperties
                    config={selectedBlock.config as ChartBlockConfig}
                    onChange={updateConfig}
                    onChangeType={(type, horizontal) => {
                      updateConfig('chartType', type)
                      updateConfig('horizontal', horizontal)
                    }}
                  />
                )}
                {selectedBlock.type === 'table' && <TableProperties config={selectedBlock.config as TableBlockConfig} onChange={updateConfig} />}
                {selectedBlock.type === 'image' && <ImageProperties config={selectedBlock.config as ImageBlockConfig} onChange={updateConfig} />}
                {selectedBlock.type === 'shape' && <ShapeProperties config={selectedBlock.config as ShapeBlockConfig} onChange={updateConfig} />}
                {selectedBlock.type === 'connector' && <ConnectorProperties config={selectedBlock.config as ConnectorBlockConfig} onChange={updateConfig} blockIds={spec?.blocks.map((b) => b.id) || []} />}
                {selectedBlock.type === 'divider' && <DividerProperties config={selectedBlock.config as DividerBlockConfig} onChange={updateConfig} />}
              </motion.div>
            )}

            {activeTab === 'properties' && !selectedBlock && (
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center py-12 text-center">
                <div className="h-10 w-10 rounded-xl border-2 border-dashed flex items-center justify-center mb-3" style={{ borderColor: 'var(--border)' }}>
                  <SlidersHorizontal size={16} style={{ color: 'var(--text-subtle)', opacity: 0.5 }} />
                </div>
                    <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{t(language, 'common.noResults')}</p>
                <p className="text-[10px] mt-1" style={{ color: 'var(--text-subtle)' }}>{t(language, 'common.clickToEdit')}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </aside>
    </>
  )
}

/* ── Layout helpers ── */

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-subtle)' }}>{label}</div>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-medium block" style={{ color: 'var(--text-subtle)' }}>{label}</label>
      {children}
    </div>
  )
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="w-full text-xs rounded-md border px-2.5 py-1.5 outline-none focus:border-[var(--accent)] transition-colors"
      style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)', color: 'var(--text)' }} />
  )
}

function NumInput({ value, onChange, min, max, step }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number }) {
  return (
    <input type="number" value={value} min={min} max={max} step={step}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className="w-full text-xs rounded-md border px-2.5 py-1.5 outline-none focus:border-[var(--accent)] transition-colors"
      style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)', color: 'var(--text)' }} />
  )
}

function SelectInput({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full text-xs rounded-md border px-2.5 py-1.5 outline-none focus:border-[var(--accent)] transition-colors cursor-pointer"
      style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)', color: 'var(--text)' }}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <ColorPicker value={value} onChange={onChange} allowTransparent />
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <button
        onClick={() => onChange(!value)}
        style={{
          width: 32, height: 18, borderRadius: 9, border: 'none', cursor: 'pointer',
          background: value ? 'var(--accent)' : 'var(--surface-muted)',
          position: 'relative', transition: 'background 0.15s', flexShrink: 0,
        }}
      >
        <span style={{
          position: 'absolute', top: 2, left: value ? 16 : 2,
          width: 14, height: 14, borderRadius: '50%', background: '#fff',
          transition: 'left 0.15s', display: 'block',
        }} />
      </button>
    </label>
  )
}

/* ── Map properties ── */
function MapProperties({ config, onChange }: { config: MapBlockConfig; onChange: (p: string, v: unknown) => void }) {
  const { language } = useAppStore()
  return (
    <div className="space-y-3">
      <Section label={t(language, 'prop.borders')}>
        <Toggle value={config.showInternalBorders !== false} onChange={(v) => onChange('showInternalBorders', v)} label={t(language, 'visual.innerBorders')} />
        <Toggle value={!!config.showOuterBorder} onChange={(v) => onChange('showOuterBorder', v)} label={t(language, 'visual.outerBorder')} />
        {config.showOuterBorder && (
          <div className="space-y-1.5 pl-1 border-l-2 ml-1" style={{ borderColor: 'var(--accent)' }}>
            <Field label={t(language, 'visual.outlineColor')}><ColorInput value={config.outerBorderColor || '#ffffff'} onChange={(v) => onChange('outerBorderColor', v)} /></Field>
            <Field label={t(language, 'prop.thickness')}><NumInput value={config.outerBorderWidth ?? 2} onChange={(v) => onChange('outerBorderWidth', v)} min={0.5} max={20} step={0.5} /></Field>
          </div>
        )}
      </Section>
      <div className="rounded-md border px-3 py-2.5 text-[11px] leading-relaxed"
        style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
        {t(language, 'prop.placeholderHint')}
      </div>
    </div>
  )
}

/* ── Card properties ── */
const CARD_PRESETS: Array<{
  id: string
  label: string
  category: 'infografico' | 'tecnico' | 'profissional'
  template: CardTemplate
  config: Partial<CardBlockConfig>
}> = [
  {
    id: 'info-kpi',
    label: 'KPI Editorial',
    category: 'infografico',
    template: 'stat',
    config: {
      title: 'POPULAÇÃO',
      value: '12,4M',
      subtitle: '+2,1% YoY',
      color: '#2563eb',
      textColor: 'var(--text)',
      backgroundColor: 'rgba(15,25,40,0.35)',
      showAccentBar: true,
      accentBarPosition: 'left',
      accentBarWidth: 3,
      rounded: 12,
      shadow: true,
      fontFamily: 'condensed',
    },
  },
  {
    id: 'info-highlight',
    label: 'Destaque Gradiente',
    category: 'infografico',
    template: 'highlight',
    config: {
      title: 'IMPACTO',
      value: '93%',
      subtitle: 'Cobertura nacional',
      color: '#1d4ed8',
      colorSecondary: '#38bdf8',
      textColor: '#ffffff',
      rounded: 16,
      shadow: true,
      fontFamily: 'condensed',
    },
  },
  {
    id: 'info-numbered',
    label: 'Ranking Editorial',
    category: 'infografico',
    template: 'numbered',
    config: {
      title: 'Índice de eficiência',
      subtitle: 'Meta 2026',
      value: '01',
      color: '#0ea5e9',
      backgroundColor: 'rgba(15,25,40,0.4)',
      textColor: 'var(--text)',
      rounded: 14,
      shadow: true,
      fontFamily: 'condensed',
    },
  },
  {
    id: 'info-badge',
    label: 'Badge de Destaque',
    category: 'infografico',
    template: 'badge',
    config: {
      badge: 'ALERTA',
      value: 'Risco alto',
      subtitle: 'Zona costeira',
      color: '#f97316',
      backgroundColor: 'rgba(15,25,40,0.32)',
      textColor: 'var(--text)',
      rounded: 12,
      shadow: true,
      fontFamily: 'condensed',
    },
  },
  {
    id: 'info-quote',
    label: 'Citação Editorial',
    category: 'infografico',
    template: 'quote',
    config: {
      value: 'Investir em dados melhora a tomada de decisão.',
      author: 'Relatorio Setorial',
      color: '#38bdf8',
      backgroundColor: 'rgba(15,25,40,0.25)',
      textColor: 'var(--text)',
      rounded: 14,
      shadow: true,
      fontFamily: 'serif',
    },
  },
  {
    id: 'info-pill',
    label: 'Pill Informativo',
    category: 'infografico',
    template: 'pill',
    config: {
      title: 'Zona',
      value: 'Norte',
      color: '#0ea5e9',
      backgroundColor: 'rgba(14,165,233,0.12)',
      textColor: 'var(--text)',
      rounded: 999,
      shadow: false,
      fontFamily: 'condensed',
    },
  },
  {
    id: 'tech-progress',
    label: 'Progresso Técnico',
    category: 'tecnico',
    template: 'progress',
    config: {
      title: 'Capacidade instalada',
      value: '780 MW',
      subtitle: 'Meta: 1,2 GW',
      progressValue: 780,
      progressMax: 1200,
      color: '#10b981',
      colorSecondary: '#22d3ee',
      backgroundColor: 'rgba(15,25,40,0.32)',
      textColor: 'var(--text)',
      rounded: 12,
      shadow: false,
      fontFamily: 'mono',
    },
  },
  {
    id: 'tech-split',
    label: 'Split Métrico',
    category: 'tecnico',
    template: 'split',
    config: {
      title: 'Eficiência',
      subtitle: 'kWh/m²',
      value: '4,28',
      color: '#60a5fa',
      backgroundColor: 'rgba(15,25,40,0.32)',
      textColor: 'var(--text)',
      rounded: 10,
      fontFamily: 'mono',
    },
  },
  {
    id: 'tech-trend',
    label: 'Tendência Técnica',
    category: 'tecnico',
    template: 'trend',
    config: {
      title: 'Demanda (MW)',
      value: '1.240',
      subtitle: 'Últimos 12 meses',
      delta: '+6,4%',
      trend: 'up',
      color: '#22c55e',
      backgroundColor: 'rgba(15,25,40,0.28)',
      textColor: 'var(--text)',
      rounded: 12,
      fontFamily: 'mono',
    },
  },
  {
    id: 'tech-kpi',
    label: 'KPI Operacional',
    category: 'tecnico',
    template: 'stat',
    config: {
      title: 'Disponibilidade',
      value: '99,2%',
      subtitle: 'SLA mensal',
      color: '#16a34a',
      backgroundColor: 'rgba(15,25,40,0.28)',
      textColor: 'var(--text)',
      rounded: 10,
      shadow: false,
      fontFamily: 'mono',
      showAccentBar: true,
      accentBarPosition: 'left',
    },
  },
  {
    id: 'tech-comparison',
    label: 'Comparação Técnica',
    category: 'tecnico',
    template: 'comparison',
    config: {
      title: 'Consumo',
      value: '480 kWh',
      valueB: '510 kWh',
      labelA: 'Atual',
      labelB: 'Meta',
      subtitle: 'Unidade 03',
      color: '#22d3ee',
      backgroundColor: 'rgba(15,25,40,0.28)',
      textColor: 'var(--text)',
      rounded: 10,
      shadow: false,
      fontFamily: 'mono',
    },
  },
  {
    id: 'tech-icon',
    label: 'Indicador de Sistema',
    category: 'tecnico',
    template: 'icon',
    config: {
      title: 'Latência',
      value: '42 ms',
      subtitle: 'P95',
      icon: 'LT',
      color: '#38bdf8',
      backgroundColor: 'rgba(15,25,40,0.28)',
      textColor: 'var(--text)',
      rounded: 10,
      shadow: false,
      fontFamily: 'mono',
    },
  },
  {
    id: 'tech-split-compact',
    label: 'Split Compacto',
    category: 'tecnico',
    template: 'split',
    config: {
      title: 'Voltagem',
      subtitle: 'kV',
      value: '13,8',
      color: '#a855f7',
      backgroundColor: 'rgba(15,25,40,0.28)',
      textColor: 'var(--text)',
      rounded: 10,
      shadow: false,
      fontFamily: 'mono',
    },
  },
  {
    id: 'pro-minimal',
    label: 'Minimal Profissional',
    category: 'profissional',
    template: 'minimal',
    config: {
      title: 'Receita líquida',
      value: 'R$ 8,2B',
      subtitle: 'FY 2025',
      color: '#1e293b',
      textColor: 'var(--text)',
      backgroundColor: 'rgba(255,255,255,0.02)',
      rounded: 14,
      shadow: false,
      fontFamily: 'serif',
    },
  },
  {
    id: 'pro-icon',
    label: 'Ícone Corporativo',
    category: 'profissional',
    template: 'icon',
    config: {
      title: 'SLA de atendimento',
      value: '98,7%',
      subtitle: 'Último trimestre',
      icon: 'SL',
      color: '#0f172a',
      backgroundColor: 'rgba(255,255,255,0.02)',
      textColor: 'var(--text)',
      rounded: 12,
      shadow: false,
      fontFamily: 'sans',
    },
  },
  {
    id: 'pro-comparison',
    label: 'Comparação Executiva',
    category: 'profissional',
    template: 'comparison',
    config: {
      title: 'ROI',
      value: '14,2%',
      valueB: '11,8%',
      labelA: '2024',
      labelB: '2023',
      subtitle: 'Crescimento anual',
      color: '#0ea5e9',
      backgroundColor: 'rgba(255,255,255,0.02)',
      textColor: 'var(--text)',
      rounded: 12,
      shadow: false,
      fontFamily: 'sans',
    },
  },
  {
    id: 'pro-gradient',
    label: 'Gradiente Corporativo',
    category: 'profissional',
    template: 'gradient',
    config: {
      title: 'EBITDA',
      value: 'R$ 3,1B',
      subtitle: 'FY 2025',
      color: '#1f4f8f',
      colorSecondary: '#0f172a',
      textColor: '#ffffff',
      rounded: 14,
      shadow: true,
      fontFamily: 'sans',
    },
  },
  {
    id: 'pro-badge',
    label: 'Badge Executivo',
    category: 'profissional',
    template: 'badge',
    config: {
      badge: 'CONFIDENCIAL',
      value: 'Q2 Results',
      subtitle: 'Uso interno',
      color: '#94a3b8',
      backgroundColor: 'rgba(255,255,255,0.02)',
      textColor: 'var(--text)',
      rounded: 12,
      shadow: false,
      fontFamily: 'serif',
    },
  },
  {
    id: 'pro-progress',
    label: 'Entrega Executiva',
    category: 'profissional',
    template: 'progress',
    config: {
      title: 'Roadmap',
      value: '62%',
      subtitle: 'Q3 concluido',
      progressValue: 62,
      progressMax: 100,
      color: '#2563eb',
      colorSecondary: '#60a5fa',
      backgroundColor: 'rgba(255,255,255,0.02)',
      textColor: 'var(--text)',
      rounded: 12,
      shadow: false,
      fontFamily: 'sans',
    },
  },
  {
    id: 'pro-split',
    label: 'Split Financeiro',
    category: 'profissional',
    template: 'split',
    config: {
      title: 'Custo medio',
      subtitle: 'por unidade',
      value: 'R$ 42,3',
      color: '#0ea5e9',
      backgroundColor: 'rgba(255,255,255,0.02)',
      textColor: 'var(--text)',
      rounded: 12,
      shadow: false,
      fontFamily: 'sans',
    },
  },
]

function getCardCategories(language: Language): { id: 'infografico' | 'tecnico' | 'profissional'; label: string; hint: string }[] {
  return [
    { id: 'infografico', label: t(language, 'card.cat.infographic'), hint: t(language, 'card.cat.infographicHint') },
    { id: 'tecnico', label: t(language, 'card.cat.technical'), hint: t(language, 'card.cat.technicalHint') },
    { id: 'profissional', label: t(language, 'card.cat.professional'), hint: t(language, 'card.cat.professionalHint') },
  ]
}

function CardThumb({ preset }: { preset: (typeof CARD_PRESETS)[number] }) {
  const bg = preset.config.backgroundColor || 'rgba(255,255,255,0.04)'
  const accent = preset.config.color || '#2563eb'
  const text = preset.config.textColor || 'var(--text)'
  return (
    <div style={{
      width: '100%', height: 68,
      borderRadius: 12,
      background: bg,
      border: `1px solid rgba(255,255,255,0.08)`,
      padding: 8,
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      color: text,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {preset.template === 'highlight' && (
        <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, ${accent}, ${preset.config.colorSecondary || accent})`, opacity: 0.9 }} />
      )}
      {preset.config.showAccentBar !== false && preset.template === 'stat' && (
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: accent }} />
      )}
      <div style={{ position: 'relative', zIndex: 1, fontSize: 8, letterSpacing: 0.6, textTransform: 'uppercase', color: preset.template === 'highlight' ? 'rgba(255,255,255,0.85)' : 'var(--text-subtle)' }}>
        {preset.config.title || 'Título'}
      </div>
      <div style={{ position: 'relative', zIndex: 1, fontSize: 16, fontWeight: 700, color: preset.template === 'highlight' ? '#fff' : text, lineHeight: 1 }}>
        {preset.config.value || '0'}
      </div>
      {preset.template === 'progress' && (
        <div style={{ position: 'relative', zIndex: 1, height: 5, borderRadius: 999, background: 'rgba(255,255,255,0.12)' }}>
          <div style={{ height: '100%', width: '68%', borderRadius: 999, background: accent }} />
        </div>
      )}
      {preset.template === 'comparison' && (
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', fontSize: 8, color: 'var(--text-subtle)' }}>
          <span>{preset.config.labelA || 'A'}</span>
          <span>{preset.config.labelB || 'B'}</span>
        </div>
      )}
      {preset.template === 'trend' && (
        <div style={{ position: 'relative', zIndex: 1, fontSize: 8, color: accent }}>▲ {preset.config.delta || '+0%'} </div>
      )}
    </div>
  )
}

function CardProperties({ config, onChange }: { config: CardBlockConfig; onChange: (p: string, v: unknown) => void }) {
  const { language } = useAppStore()
  const tpl = config.template || 'stat'
  return (
    <div className="space-y-3">
      <Section label={t(language, 'prop.template')}>
        <div className="grid grid-cols-2 gap-2">
          {CARD_PRESETS.map((preset) => {
            const active = tpl === preset.template
            return (
              <button
                key={preset.id}
                onClick={() => {
                  onChange('template', preset.template)
                  Object.entries(preset.config).forEach(([k, v]) => onChange(k, v as unknown))
                }}
                className="rounded-md border p-2 text-[10px] font-semibold transition-all"
                style={{
                  background: active ? 'var(--accent-soft)' : 'var(--surface-strong)',
                  borderColor: active ? 'var(--accent)' : 'var(--border)',
                  color: active ? 'var(--accent)' : 'var(--text)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                }}
              >
                <CardThumb preset={preset} />
                <div style={{ fontSize: 9, color: active ? 'var(--accent)' : 'var(--text-subtle)' }}>{preset.label}</div>
              </button>
            )}
          )}
        </div>
      </Section>

      <Section label={t(language, 'prop.content')}>
        <Field label={t(language, 'prop.chartTitle')}><TextInput value={config.title || ''} onChange={(v) => onChange('title', v)} /></Field>
        <Field label={t(language, 'prop.valueSize')}><TextInput value={String(config.value ?? '')} onChange={(v) => onChange('value', v)} /></Field>
        {(tpl === 'comparison') && (
          <>
            <Field label="Valor B"><TextInput value={String(config.valueB ?? '')} onChange={(v) => onChange('valueB', v)} /></Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Label A"><TextInput value={config.labelA || ''} onChange={(v) => onChange('labelA', v)} /></Field>
              <Field label="Label B"><TextInput value={config.labelB || ''} onChange={(v) => onChange('labelB', v)} /></Field>
            </div>
          </>
        )}
        {tpl === 'quote' && <Field label="Autor"><TextInput value={config.author || ''} onChange={(v) => onChange('author', v)} /></Field>}
        {tpl === 'badge' && <Field label="Badge"><TextInput value={config.badge || ''} onChange={(v) => onChange('badge', v)} /></Field>}
        {tpl === 'icon' && <Field label="Ícone (1-2 caracteres)"><TextInput value={config.icon || ''} onChange={(v) => onChange('icon', v)} /></Field>}
        {tpl === 'progress' && (
          <div className="grid grid-cols-2 gap-2">
            <Field label="Progresso"><NumInput value={config.progressValue ?? 50} onChange={(v) => onChange('progressValue', v)} min={0} max={1000} /></Field>
            <Field label="Máximo"><NumInput value={config.progressMax ?? 100} onChange={(v) => onChange('progressMax', v)} min={1} max={10000} /></Field>
          </div>
        )}
        <Field label={t(language, 'prop.chartSubtitle')}><TextInput value={config.subtitle || ''} onChange={(v) => onChange('subtitle', v)} /></Field>
        {tpl === 'trend' && (
          <>
            <Field label={t(language, 'prop.delta')}><TextInput value={config.delta || ''} onChange={(v) => onChange('delta', v)} /></Field>
            <Field label={t(language, 'prop.trend')}>
              <SelectInput value={config.trend || 'flat'} onChange={(v) => onChange('trend', v)}
                options={[{ value: 'up', label: t(language, 'prop.trendUp') }, { value: 'down', label: t(language, 'prop.trendDown') }, { value: 'flat', label: t(language, 'prop.trendFlat') }]} />
            </Field>
          </>
        )}
      </Section>

      <Section label={t(language, 'prop.typography')}>
        <Field label={t(language, 'prop.family')}>
          <SelectInput value={config.fontFamily || 'sans'} onChange={(v) => onChange('fontFamily', v)}
            options={[{ value: 'sans', label: 'Sans' }, { value: 'condensed', label: 'Condensed' }, { value: 'serif', label: 'Serif' }, { value: 'mono', label: 'Mono' }]} />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Field label={t(language, 'prop.titleSize')}><NumInput value={config.titleSize ?? 10} onChange={(v) => onChange('titleSize', v)} min={6} max={48} /></Field>
          <Field label={t(language, 'prop.valueSize')}><NumInput value={config.valueSize ?? 34} onChange={(v) => onChange('valueSize', v)} min={10} max={120} /></Field>
          <Field label={t(language, 'prop.subtitleSize')}><NumInput value={config.subtitleSize ?? 11} onChange={(v) => onChange('subtitleSize', v)} min={6} max={32} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t(language, 'prop.weightTitle')}><NumInput value={config.titleWeight ?? 600} onChange={(v) => onChange('titleWeight', v)} min={100} max={900} step={100} /></Field>
          <Field label={t(language, 'prop.weightValue')}><NumInput value={config.valueWeight ?? 600} onChange={(v) => onChange('valueWeight', v)} min={100} max={900} step={100} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Toggle value={!!config.italicTitle} onChange={(v) => onChange('italicTitle', v)} label={t(language, 'prop.italicTitle')} />
          <Toggle value={!!config.italicValue} onChange={(v) => onChange('italicValue', v)} label={t(language, 'prop.italicValue')} />
        </div>
      </Section>

      <Section label={t(language, 'prop.visual')}>
        <Field label={t(language, 'prop.colorAccent')}><ColorInput value={config.color || '#2563eb'} onChange={(v) => onChange('color', v)} /></Field>
        {(tpl === 'gradient' || tpl === 'progress') && (
          <Field label={t(language, 'prop.colorSecondary')}><ColorInput value={config.colorSecondary || ''} onChange={(v) => onChange('colorSecondary', v)} /></Field>
        )}
        <Field label={t(language, 'prop.bgColor')}><ColorInput value={config.backgroundColor || 'transparent'} onChange={(v) => onChange('backgroundColor', v)} /></Field>
        <Field label={t(language, 'prop.textColor')}><ColorInput value={config.textColor || 'var(--text)'} onChange={(v) => onChange('textColor', v)} /></Field>
        <Field label={t(language, 'prop.align')}>
          <SelectInput value={config.align || 'left'} onChange={(v) => onChange('align', v)}
            options={[{ value: 'left', label: t(language, 'prop.labelLeft') }, { value: 'center', label: t(language, 'prop.labelCenter') }, { value: 'right', label: t(language, 'prop.labelRight') }]} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t(language, 'prop.padding')}><NumInput value={config.padding ?? 16} onChange={(v) => onChange('padding', v)} min={0} max={48} /></Field>
          <Field label={t(language, 'prop.radius')}><NumInput value={config.rounded ?? 10} onChange={(v) => onChange('rounded', v)} min={0} max={60} /></Field>
        </div>
        <Toggle value={config.showAccentBar !== false} onChange={(v) => onChange('showAccentBar', v)} label={t(language, 'prop.barAccent')} />
        {config.showAccentBar !== false && (
          <div className="grid grid-cols-2 gap-2">
            <Field label={t(language, 'prop.barPos')}>
              <SelectInput value={config.accentBarPosition || 'left'} onChange={(v) => onChange('accentBarPosition', v)}
                options={[{ value: 'left', label: t(language, 'prop.labelEsq') }, { value: 'right', label: t(language, 'prop.labelDir') }, { value: 'top', label: t(language, 'prop.labelTopo') }, { value: 'bottom', label: t(language, 'prop.labelBase') }]} />
            </Field>
            <Field label={t(language, 'prop.barWidth')}><NumInput value={config.accentBarWidth ?? 3} onChange={(v) => onChange('accentBarWidth', v)} min={1} max={20} /></Field>
          </div>
        )}
        <Toggle value={!!config.shadow} onChange={(v) => onChange('shadow', v)} label={t(language, 'prop.shadow')} />
        <Toggle value={!!config.border} onChange={(v) => onChange('border', v)} label={t(language, 'prop.border')} />
        {config.border && (
          <Field label={t(language, 'prop.borderColor')}><ColorInput value={config.borderColor || 'rgba(125,140,160,0.18)'} onChange={(v) => onChange('borderColor', v)} /></Field>
        )}
      </Section>
    </div>
  )
}

/* ── Text properties (background + spacing only — toolbar handles inline styles) ── */
function TextProperties({ config, onChange }: { config: TextBlockConfig; onChange: (p: string, v: unknown) => void }) {
  const { language } = useAppStore()
  return (
    <div className="space-y-3">
      <Section label={t(language, 'prop.typography')}>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t(language, 'prop.lineHeight')}>
            <NumInput value={config.lineHeight || 1.5} onChange={(v) => onChange('lineHeight', v)} min={0.8} max={3} step={0.1} />
          </Field>
          <Field label={t(language, 'prop.letterSpacing')}>
            <NumInput value={config.letterSpacing || 0} onChange={(v) => onChange('letterSpacing', v)} min={-2} max={12} step={0.5} />
          </Field>
        </div>
        <Field label={t(language, 'prop.textTransform')}>
          <SelectInput value={config.textTransform || 'none'} onChange={(v) => onChange('textTransform', v)}
            options={[
              { value: 'none', label: 'Normal' },
              { value: 'uppercase', label: 'MAIUSCULAS' },
              { value: 'capitalize', label: 'Capitalizar' },
              { value: 'lowercase', label: 'minusculas' },
            ]} />
        </Field>
        <Field label={t(language, 'prop.innerPadding')}>
          <NumInput value={config.padding ?? 10} onChange={(v) => onChange('padding', v)} min={0} max={60} />
        </Field>
      </Section>

      <Section label={t(language, 'prop.background')}>
        <Field label={t(language, 'prop.bgStyle')}>
          <SelectInput value={config.backgroundStyle || 'none'} onChange={(v) => onChange('backgroundStyle', v)}
            options={[
              { value: 'none', label: 'Transparente' },
              { value: 'card', label: 'Card escuro' },
              { value: 'glass', label: 'Vidro fosco' },
              { value: 'paper', label: 'Papel' },
              { value: 'strip', label: 'Faixa lateral' },
              { value: 'highlight', label: 'Destaque' },
            ]} />
        </Field>
        <Field label={t(language, 'prop.bgColor')}><ColorInput value={config.backgroundColor || 'transparent'} onChange={(v) => onChange('backgroundColor', v)} /></Field>
      </Section>

      <div className="rounded-md border px-3 py-2.5 text-[11px] leading-relaxed"
        style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
        {t(language, 'prop.tipSelectText')}
      </div>
    </div>
  )
}

/* ── Chart properties ── */
function ChartProperties({
  config, onChange, onChangeType,
}: {
  config: ChartBlockConfig
  onChange: (p: string, v: unknown) => void
  onChangeType: (type: ChartType, horizontal: boolean) => void
}) {
  const { language } = useAppStore()
  const [spreadsheetOpen, setSpreadsheetOpen] = useState(false)
  const labels = config.data?.labels || []
  const values = config.data?.values || []
  const colors = config.colors?.length ? config.colors : []

  const updateRow = (i: number, key: 'label' | 'value', raw: string) => {
    const newLabels = [...labels]
    const newValues = [...values]
    if (key === 'label') { newLabels[i] = raw }
    else { newValues[i] = parseFloat(raw) || 0 }
    onChange('data', { ...config.data, labels: newLabels, values: newValues })
  }

  const addRow = () => {
    onChange('data', {
      ...config.data,
      labels: [...labels, t(language, 'chart.defaultItem', { count: labels.length + 1 })],
      values: [...values, 0],
    })
  }

  const removeRow = (i: number) => {
    onChange('data', {
      ...config.data,
      labels: labels.filter((_, idx) => idx !== i),
      values: values.filter((_, idx) => idx !== i),
    })
  }

  /* Build a full-length color array so each slice/bar gets its own colour.
     Unset slots are filled from the default palette. */
  const resolvedColors = useMemo(() => {
    const base = colors.length ? [...colors] : []
    const out: string[] = []
    for (let i = 0; i < labels.length; i++) {
      out[i] = base[i] || CHART_PALETTE[i % CHART_PALETTE.length]
    }
    return out
  }, [colors, labels.length])

  const setColor = (i: number, color: string) => {
    const next = [...resolvedColors]
    next[i] = color
    onChange('colors', next)
  }

  const mainContent = (
    <div className="space-y-3">
      <Section label={t(language, 'prop.chartType')}>
        {getChartCategories(language).map((cat) => {
          const catTypes = getChartTypes(language).filter((ct) => CHART_TYPE_META[ct.id]?.category === cat.id)
          return (
            <div key={cat.id} className="mb-2">
              <div className="text-[9px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'var(--text-subtle)' }}>{cat.label}</div>
              <div className="grid grid-cols-4 gap-1">
                {catTypes.map((ct, i) => {
                  const active = config.chartType === ct.id && !!config.horizontal === !!ct.horizontal
                  return (
                    <button key={`${ct.id}-${ct.horizontal ? 'h' : 'v'}-${i}`} onClick={() => onChangeType(ct.id, ct.horizontal || false)}
                      title={ct.desc}
                      style={{
                        background: active ? 'var(--accent-soft)' : 'var(--surface-strong)',
                        border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                        borderRadius: 6, padding: '5px 4px 3px', cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                        transition: 'all 0.1s',
                      }}>
                      <div style={{ width: 28, height: 20, color: active ? 'var(--accent)' : 'var(--text-muted)' }}>
                        {ct.thumb}
                      </div>
                      <div style={{ fontSize: 8, color: active ? 'var(--accent)' : 'var(--text-subtle)', fontWeight: 600, lineHeight: 1.1 }}>
                        {ct.label}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </Section>

      {/* Titles */}
      <Section label={t(language, 'prop.labels')}>
        <Field label={t(language, 'prop.chartTitle')}><TextInput value={config.title || ''} onChange={(v) => onChange('title', v)} placeholder={t(language, 'prop.chartTitlePlaceholder')} /></Field>
        <Field label={t(language, 'prop.chartSubtitle')}><TextInput value={config.subtitle || ''} onChange={(v) => onChange('subtitle', v)} placeholder={t(language, 'prop.chartSubtitlePlaceholder')} /></Field>
      </Section>

      {/* Data — inline rows + spreadsheet button */}
      <Section label={t(language, 'prop.data')}>
        <div className="space-y-1">
          <button onClick={() => setSpreadsheetOpen(true)}
            className="w-full text-[11px] font-semibold py-2 rounded-md border flex items-center justify-center gap-2 transition-colors"
            style={{ borderColor: 'var(--accent)', color: 'var(--accent)', background: 'var(--accent-soft)' }}>
            <BarChart3 size={13} /> {t(language, 'prop.spreadsheet')}
          </button>
          <div className="text-[9px] text-[var(--text-subtle)] text-center mt-0.5">
            {t(language, 'prop.spreadsheetHint')}
          </div>
          <div className="mt-2 space-y-1">
            {labels.map((label, i) => (
              <div key={i} className="grid gap-1 items-center" style={{ gridTemplateColumns: '1fr 60px 22px' }}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <input
                    type="color"
                    value={resolvedColors[i]?.startsWith('#') ? resolvedColors[i] : '#2563eb'}
                    onChange={(e) => setColor(i, e.target.value)}
                    style={{ width: 12, height: 12, border: 'none', borderRadius: 2, padding: 0, cursor: 'pointer', flexShrink: 0, marginRight: 4 }} />
                  <input type="text" value={label} onChange={(e) => updateRow(i, 'label', e.target.value)}
                    className="flex-1 text-[10px] rounded border px-1 py-0.5 outline-none focus:border-[var(--accent)]"
                    style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)', color: 'var(--text)', minWidth: 0 }} />
                </div>
                <input type="number" value={values[i] ?? 0} onChange={(e) => updateRow(i, 'value', e.target.value)}
                  className="text-[10px] rounded border px-1 py-0.5 outline-none focus:border-[var(--accent)]"
                  style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)', color: 'var(--text)' }} />
                <button onClick={() => removeRow(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <MinusIcon size={11} />
                </button>
              </div>
            ))}
            <button onClick={addRow}
              className="w-full text-[9px] font-medium py-1 rounded-md border border-dashed flex items-center justify-center gap-1 transition-colors"
              style={{ borderColor: 'var(--border)', color: 'var(--text-subtle)' }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-subtle)' }}>
              <Plus size={10} /> {t(language, 'prop.addRow')}
            </button>
          </div>
        </div>
      </Section>

      {/* Visual toggles */}
      <Section label={t(language, 'prop.visual')}>
        <div className="space-y-2">
          <Toggle value={config.showGrid !== false} onChange={(v) => onChange('showGrid', v)} label={t(language, 'prop.showGrid')} />
          <Toggle value={!!config.showValues} onChange={(v) => onChange('showValues', v)} label={t(language, 'prop.showValues')} />
          <Toggle value={!!config.showLegend} onChange={(v) => onChange('showLegend', v)} label={t(language, 'prop.showLegend')} />
          {config.showLegend && (
            <Field label={t(language, 'prop.legendPosition')}>
              <SelectInput value={config.legendPosition || 'bottom'} onChange={(v) => onChange('legendPosition', v as LegendPosition)}
                options={[{ value: 'top', label: t(language, 'prop.labelTopo') }, { value: 'right', label: t(language, 'prop.labelDir') }, { value: 'bottom', label: t(language, 'prop.labelBase') }, { value: 'left', label: t(language, 'prop.labelEsq') }]} />
            </Field>
          )}
          {(config.chartType === 'line' || config.chartType === 'area') && (
            <Toggle value={config.curved !== false} onChange={(v) => onChange('curved', v)} label={t(language, 'prop.curvedLines')} />
          )}
          {(config.chartType === 'bar' || config.chartType === 'grouped') && (
            <Toggle value={config.rounded !== false} onChange={(v) => onChange('rounded', v)} label={t(language, 'prop.roundedBars')} />
          )}
          {config.chartType === 'bar' && (
            <Field label={t(language, 'prop.colorAccent')}><ColorInput value={config.barColor || '#7a8a9a'} onChange={(v) => onChange('barColor', v)} /></Field>
          )}
          {config.chartType === 'donut' && (
            <Field label={t(language, 'prop.innerRadius')}>
              <NumInput value={config.innerRadius ?? 55} onChange={(v) => onChange('innerRadius', v)} min={10} max={85} />
            </Field>
          )}
          <Field label={t(language, 'prop.sort')}>
            <SelectInput value={config.sortMode || 'none'} onChange={(v) => onChange('sortMode', v as any)}
              options={[
                { value: 'none', label: t(language, 'prop.sortNone') },
                { value: 'valueDesc', label: t(language, 'prop.sortValueDesc') },
                { value: 'valueAsc', label: t(language, 'prop.sortValueAsc') },
                { value: 'labelAsc', label: t(language, 'prop.sortLabelAsc') },
                { value: 'labelDesc', label: t(language, 'prop.sortLabelDesc') },
              ]} />
          </Field>
          <Field label={t(language, 'prop.labelFontSize')}><NumInput value={config.fontSize ?? 10} onChange={(v) => onChange('fontSize', v)} min={7} max={20} /></Field>
          <Field label="Angulo rotulo X"><NumInput value={config.xLabelAngle ?? 0} onChange={(v) => onChange('xLabelAngle', v)} min={-90} max={90} /></Field>
          <Field label="Espaco eixo Y"><NumInput value={config.axisPadding ?? 8} onChange={(v) => onChange('axisPadding', v)} min={0} max={40} /></Field>
        </div>
        <Field label={t(language, 'prop.textColor')}><ColorInput value={config.textColor || '#c8d4e0'} onChange={(v) => onChange('textColor', v)} /></Field>
        <Field label={t(language, 'prop.bgColor')}><ColorInput value={config.backgroundColor || 'transparent'} onChange={(v) => onChange('backgroundColor', v)} /></Field>
      </Section>

      <Section label={t(language, 'prop.valueFormat')}>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t(language, 'prop.valuePrefix')}><TextInput value={config.valuePrefix || ''} onChange={(v) => onChange('valuePrefix', v)} placeholder="R$" /></Field>
          <Field label={t(language, 'prop.valueSuffix')}><TextInput value={config.valueSuffix || ''} onChange={(v) => onChange('valueSuffix', v)} placeholder="%" /></Field>
        </div>
        <Field label={t(language, 'prop.valueDecimals')}><NumInput value={config.valueDecimals ?? 0} onChange={(v) => onChange('valueDecimals', v)} min={0} max={4} /></Field>
      </Section>

      {config.chartType === 'donut' && (
        <Section label={t(language, 'prop.center')}>
          <Field label={t(language, 'prop.centerLabel')}><TextInput value={config.centerLabel || ''} onChange={(v) => onChange('centerLabel', v)} placeholder="Auto (soma)" /></Field>
          <Field label={t(language, 'prop.centerSubLabel')}><TextInput value={config.centerSubLabel || ''} onChange={(v) => onChange('centerSubLabel', v)} /></Field>
        </Section>
      )}

      {config.chartType === 'radar' && (
        <Section label="Radar">
          <Field label={t(language, 'prop.radarMax')}><NumInput value={config.radarMax ?? 0} onChange={(v) => onChange('radarMax', v)} min={0} step={10} /></Field>
        </Section>
      )}

      {config.chartType === 'grouped' && (
        <Section label="Agrupado">
          <Toggle value={config.dualAxis === true} onChange={(v) => onChange('dualAxis', v)} label="Dois eixos Y" />
          <Field label="Cor serie A"><ColorInput value={config.barColor || '#7a8a9a'} onChange={(v) => onChange('barColor', v)} /></Field>
          <Field label="Cor serie B"><ColorInput value={config.series2Color || colors[1] || '#4a7ba7'} onChange={(v) => onChange('series2Color', v)} /></Field>
        </Section>
      )}

      <Section label={t(language, 'prop.reference')}>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t(language, 'prop.referenceValue')}>
            <NumInput value={config.referenceValue ?? '' as any} onChange={(v) => onChange('referenceValue', v)} />
          </Field>
          <Field label={t(language, 'prop.referenceLabel')}><TextInput value={config.referenceLabel || ''} onChange={(v) => onChange('referenceLabel', v)} /></Field>
        </div>
      </Section>

      <Section label={t(language, 'prop.source')}>
        <Field label={t(language, 'prop.dataSource')}><TextInput value={config.source || ''} onChange={(v) => onChange('source', v)} placeholder={t(language, 'prop.dataSourcePlaceholder')} /></Field>
      </Section>
    </div>
  )

  return (
    <>
      {mainContent}
      {spreadsheetOpen && (
        <ChartSpreadsheet
          data={config.data}
          colors={resolvedColors}
          chartType={config.chartType}
          onChange={({ data: nextData, colors: nextColors }) => {
            onChange('data', nextData)
            if (nextColors) onChange('colors', nextColors)
          }}
          onClose={() => setSpreadsheetOpen(false)}
        />
      )}
    </>
  )
}

function getMarkerOptions(language: Language): { value: MarkerType; label: string }[] {
  return [
    { value: 'none', label: t(language, 'marker.none') },
    { value: 'arrow', label: t(language, 'marker.arrow') },
    { value: 'arrowOpen', label: t(language, 'marker.arrowOpen') },
    { value: 'arrowConcave', label: t(language, 'marker.arrowConcave') },
    { value: 'triangle', label: t(language, 'marker.triangle') },
    { value: 'circle', label: t(language, 'marker.circle') },
    { value: 'circleOpen', label: t(language, 'marker.circleOpen') },
    { value: 'square', label: t(language, 'marker.square') },
    { value: 'diamond', label: t(language, 'marker.diamond') },
    { value: 'bar', label: t(language, 'marker.bar') },
    { value: 'dot', label: t(language, 'marker.dot') },
  ]
}

/* ── Connector properties ── */
function ConnectorProperties({ config, onChange, blockIds }: { config: ConnectorBlockConfig; onChange: (p: string, v: unknown) => void; blockIds: string[] }) {
  const { language } = useAppStore()
  const blockOptions = [{ value: '', label: '—' }, ...blockIds.map((id) => ({ value: id, label: id }))]
  const anchorOptions = ['center', 'top', 'bottom', 'left', 'right'].map((v) => ({ value: v, label: v }))
  const style = (config.style || 'curved') as ConnectorStyle
  return (
    <div className="space-y-3">
      <Section label={t(language, 'prop.origin')}>
        <Field label="Bloco"><SelectInput value={config.fromAnchor?.blockId || ''} onChange={(v) => onChange('fromAnchor.blockId', v)} options={blockOptions} /></Field>
        <Field label="Ancora"><SelectInput value={config.fromAnchor?.anchor || 'center'} onChange={(v) => onChange('fromAnchor.anchor', v)} options={anchorOptions} /></Field>
      </Section>
      <Section label={t(language, 'prop.destination')}>
        <Field label="Bloco"><SelectInput value={config.toAnchor?.blockId || ''} onChange={(v) => onChange('toAnchor.blockId', v)} options={blockOptions} /></Field>
        <Field label="Ancora"><SelectInput value={config.toAnchor?.anchor || 'center'} onChange={(v) => onChange('toAnchor.anchor', v)} options={anchorOptions} /></Field>
      </Section>
      <Section label={t(language, 'prop.path')}>
        <Field label={t(language, 'prop.connectorStyle')}>
          <SelectInput value={style} onChange={(v) => onChange('style', v as ConnectorStyle)}
            options={[
              { value: 'straight', label: t(language, 'prop.connectorStraight') },
              { value: 'curved', label: t(language, 'prop.connectorCurved') },
              { value: 'orthogonal', label: t(language, 'prop.connectorOrthogonal') },
              { value: 'sCurve', label: t(language, 'prop.connectorSCurve') },
              { value: 'arc', label: t(language, 'prop.connectorArc') },
            ]} />
        </Field>
        {(style === 'curved') && (
          <Field label={t(language, 'prop.curvature')}>
            <NumInput value={config.curvature ?? 0.5} onChange={(v) => onChange('curvature', v)} min={0.1} max={0.9} step={0.1} />
          </Field>
        )}
        {(style === 'sCurve' || style === 'arc') && (
          <Field label={t(language, 'prop.bow')}>
            <NumInput value={config.bow ?? 0.4} onChange={(v) => onChange('bow', v)} min={-1} max={1} step={0.1} />
          </Field>
        )}
      </Section>
      <Section label={t(language, 'prop.visual')}>
        <Field label={t(language, 'prop.textColor')}><ColorInput value={config.color || 'var(--accent)'} onChange={(v) => onChange('color', v)} /></Field>
        <Field label={t(language, 'prop.thickness')}><NumInput value={config.strokeWidth || 2} onChange={(v) => onChange('strokeWidth', v)} min={1} max={8} /></Field>
        <Field label={t(language, 'prop.opacity')}><NumInput value={config.opacity ?? 1} onChange={(v) => onChange('opacity', v)} min={0.1} max={1} step={0.05} /></Field>
        <Field label={t(language, 'prop.dashPattern')}>
          <SelectInput value={config.dashPattern || (config.dashed ? 'dashed' : 'solid')} onChange={(v) => onChange('dashPattern', v)}
            options={[
              { value: 'solid', label: t(language, 'prop.dashSolid') },
              { value: 'dashed', label: t(language, 'prop.dashDashed') },
              { value: 'dotted', label: t(language, 'prop.dashDotted') },
              { value: 'dashLong', label: t(language, 'prop.dashLong') },
            ]} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t(language, 'prop.markerStart')}>
            <SelectInput value={config.startMarker || 'none'} onChange={(v) => onChange('startMarker', v as MarkerType)} options={getMarkerOptions(language)} />
          </Field>
          <Field label={t(language, 'prop.markerEnd')}>
            <SelectInput value={config.endMarker || 'arrow'} onChange={(v) => onChange('endMarker', v as MarkerType)} options={getMarkerOptions(language)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t(language, 'prop.markerSizeStart')}><NumInput value={config.startMarkerSize ?? 1} onChange={(v) => onChange('startMarkerSize', v)} min={0.5} max={2} step={0.1} /></Field>
          <Field label={t(language, 'prop.markerSizeEnd')}><NumInput value={config.endMarkerSize ?? 1} onChange={(v) => onChange('endMarkerSize', v)} min={0.5} max={2} step={0.1} /></Field>
        </div>
        <Toggle value={config.shadow !== false} onChange={(v) => onChange('shadow', v)} label={t(language, 'prop.shadow')} />
      </Section>
      <Section label={t(language, 'prop.label')}>
        <Field label={t(language, 'prop.labelText')}><TextInput value={config.label || ''} onChange={(v) => onChange('label', v)} placeholder={t(language, 'prop.optional')} /></Field>
        <Field label={t(language, 'prop.labelColor')}><ColorInput value={config.labelColor || 'var(--text)'} onChange={(v) => onChange('labelColor', v)} /></Field>
        <Field label={t(language, 'prop.labelBg')}><ColorInput value={config.labelBackground || 'rgba(15,25,40,0.92)'} onChange={(v) => onChange('labelBackground', v)} /></Field>
        <Field label={t(language, 'prop.labelFontSize')}><NumInput value={config.labelFontSize || 11} onChange={(v) => onChange('labelFontSize', v)} min={7} max={24} /></Field>
      </Section>
    </div>
  )
}

function getTableTemplates(language: Language): { id: TableTemplate; label: string }[] {
  return [
    { id: 'editorial', label: t(language, 'table.tpl.editorial') },
    { id: 'minimal', label: t(language, 'table.tpl.minimal') },
    { id: 'striped', label: t(language, 'table.tpl.striped') },
    { id: 'card', label: t(language, 'table.tpl.card') },
    { id: 'comparison', label: t(language, 'table.tpl.comparison') },
    { id: 'ranking', label: t(language, 'table.tpl.ranking') },
    { id: 'heatmap', label: t(language, 'table.tpl.heatmap') },
  ]
}

/* ── Table properties ── */
function TableProperties({ config, onChange }: { config: TableBlockConfig; onChange: (p: string, v: unknown) => void }) {
  const { language } = useAppStore()
  const columns = config.columns || []
  const rows = config.rows || []
  const tpl = config.template || 'editorial'

  const updateColumn = (i: number, patch: Partial<typeof columns[0]>) => {
    const next = columns.map((c, idx) => idx === i ? { ...c, ...patch } : c)
    onChange('columns', next)
  }

  const addColumn = () => {
    const key = `col${columns.length + 1}`
    onChange('columns', [...columns, { key, label: `${t(language, 'prop.columnLabel')} ${columns.length + 1}`, align: 'left' }])
  }

  const removeColumn = (i: number) => {
    const key = columns[i].key
    onChange('columns', columns.filter((_, idx) => idx !== i))
    onChange('rows', rows.map((r) => { const n = { ...r }; delete n[key]; return n }))
  }

  const updateCell = (rowIdx: number, colKey: string, value: string) => {
    const next = rows.map((r, idx) => idx === rowIdx ? { ...r, [colKey]: value } : r)
    onChange('rows', next)
  }

  const addRow = () => {
    const newRow: Record<string, unknown> = {}
    columns.forEach((c) => { newRow[c.key] = '' })
    onChange('rows', [...rows, newRow])
  }

  const removeRow = (i: number) => {
    onChange('rows', rows.filter((_, idx) => idx !== i))
  }

  const numericColumns = columns.filter((c) => ['number', 'currency', 'percent'].includes(c.format || 'text'))

  return (
    <div className="space-y-3">
      <Section label={t(language, 'prop.template')}>
        <div className="grid grid-cols-2 gap-1.5">
          {getTableTemplates(language).map((t) => (
            <button
              key={t.id}
              onClick={() => onChange('template', t.id)}
              className="text-left rounded-md border px-2.5 py-1.5 text-[11px] font-semibold transition-all"
              style={{
                background: tpl === t.id ? 'var(--accent-soft)' : 'var(--surface-strong)',
                borderColor: tpl === t.id ? 'var(--accent)' : 'var(--border)',
                color: tpl === t.id ? 'var(--accent)' : 'var(--text)',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </Section>

      <Section label={t(language, 'prop.labels')}>
        <Field label={t(language, 'prop.chartTitle')}><TextInput value={config.title || ''} onChange={(v) => onChange('title', v)} /></Field>
        <Field label={t(language, 'prop.chartSubtitle')}><TextInput value={config.subtitle || ''} onChange={(v) => onChange('subtitle', v)} /></Field>
        <Field label={t(language, 'prop.source')}><TextInput value={config.source || ''} onChange={(v) => onChange('source', v)} /></Field>
      </Section>

      <Section label={t(language, 'prop.columns')}>
        <div className="space-y-2">
          {columns.map((col, i) => (
            <div key={i} className="rounded-md border p-2 space-y-1.5" style={{ borderColor: 'var(--border)', background: 'var(--surface-strong)' }}>
              <div className="grid grid-cols-2 gap-2">
                <Field label={t(language, 'prop.columnKey')}><TextInput value={col.key} onChange={(v) => updateColumn(i, { key: v })} /></Field>
                <Field label={t(language, 'prop.columnLabel')}><TextInput value={col.label} onChange={(v) => updateColumn(i, { label: v })} /></Field>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Field label={t(language, 'prop.columnAlign')}>
                  <SelectInput value={col.align || 'left'} onChange={(v) => updateColumn(i, { align: v as any })}
                    options={[{ value: 'left', label: t(language, 'prop.alignLeft') }, { value: 'center', label: t(language, 'prop.alignCenter') }, { value: 'right', label: t(language, 'prop.alignRight') }]} />
                </Field>
                <Field label={t(language, 'prop.columnFormat')}>
                  <SelectInput value={col.format || 'text'} onChange={(v) => updateColumn(i, { format: v as any })}
                    options={[{ value: 'text', label: t(language, 'prop.formatText') }, { value: 'number', label: t(language, 'prop.formatNumber') }, { value: 'currency', label: t(language, 'prop.formatCurrency') }, { value: 'percent', label: t(language, 'prop.formatPercent') }, { value: 'date', label: t(language, 'prop.formatDate') }]} />
                </Field>
                <Field label={t(language, 'prop.columnWidth')}><NumInput value={col.width ?? 0} onChange={(v) => updateColumn(i, { width: v || undefined })} min={0} max={400} /></Field>
              </div>
              <button onClick={() => removeColumn(i)}
                className="w-full text-[10px] font-medium py-1 rounded border border-dashed transition-colors"
                style={{ borderColor: 'var(--border)', color: 'var(--danger)' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--danger)' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)' }}>
                {t(language, 'prop.removeColumn')}
              </button>
            </div>
          ))}
          <button onClick={addColumn}
            className="w-full text-[10px] font-medium py-1.5 rounded-md border border-dashed flex items-center justify-center gap-1.5 transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--text-subtle)' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-subtle)' }}>
            <Plus size={11} /> {t(language, 'prop.addColumn')}
          </button>
        </div>
      </Section>

      <Section label={t(language, 'prop.rows')}>
        <div className="space-y-1">
          <div className="grid text-[9px] font-semibold uppercase tracking-wider mb-1" style={{ gridTemplateColumns: `24px ${columns.map(() => '1fr').join(' ')} 24px`, color: 'var(--text-subtle)' }}>
            <span>#</span>
            {columns.map((c) => <span key={c.key}>{c.label}</span>)}
            <span />
          </div>
          {rows.map((row, ri) => (
            <div key={ri} className="grid gap-1 items-center" style={{ gridTemplateColumns: `24px ${columns.map(() => '1fr').join(' ')} 24px` }}>
              <span className="text-[10px] text-center" style={{ color: 'var(--text-subtle)' }}>{ri + 1}</span>
              {columns.map((col) => (
                <input key={col.key} type="text" value={String(row[col.key] ?? '')} onChange={(e) => updateCell(ri, col.key, e.target.value)}
                  className="text-[11px] rounded border px-1.5 py-1 outline-none focus:border-[var(--accent)]"
                  style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)', color: 'var(--text)' }} />
              ))}
              <button onClick={() => removeRow(ri)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-subtle)', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <MinusIcon size={12} />
              </button>
            </div>
          ))}
          <button onClick={addRow}
            className="w-full text-[10px] font-medium py-1.5 rounded-md border border-dashed flex items-center justify-center gap-1.5 transition-colors"
            style={{ borderColor: 'var(--border)', color: 'var(--text-subtle)' }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-subtle)' }}>
            <Plus size={11} /> {t(language, 'prop.addRow')}
          </button>
        </div>
      </Section>

      {tpl === 'heatmap' && numericColumns.length > 0 && (
        <Section label={t(language, 'prop.heatmap')}>
          <Field label={t(language, 'prop.valueColumn')}>
            <SelectInput value={config.valueColumn || numericColumns[0]?.key || ''} onChange={(v) => onChange('valueColumn', v)}
              options={numericColumns.map((c) => ({ value: c.key, label: c.label }))} />
          </Field>
        </Section>
      )}

      <Section label={t(language, 'prop.visual')}>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t(language, 'prop.accentColor')}><ColorInput value={config.accentColor || 'var(--accent)'} onChange={(v) => onChange('accentColor', v)} /></Field>
          <Field label={t(language, 'prop.headerColor')}><ColorInput value={config.headerColor || 'var(--text-subtle)'} onChange={(v) => onChange('headerColor', v)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t(language, 'prop.cellColor')}><ColorInput value={config.cellColor || 'var(--text)'} onChange={(v) => onChange('cellColor', v)} /></Field>
          <Field label={t(language, 'prop.borderTableColor')}><ColorInput value={config.borderColor || 'var(--border)'} onChange={(v) => onChange('borderColor', v)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t(language, 'prop.headerFontSize')}><NumInput value={config.headerFontSize || 10} onChange={(v) => onChange('headerFontSize', v)} min={7} max={24} /></Field>
          <Field label={t(language, 'prop.cellFontSize')}><NumInput value={config.cellFontSize || 11} onChange={(v) => onChange('cellFontSize', v)} min={7} max={24} /></Field>
        </div>
        <Toggle value={config.showHeader !== false} onChange={(v) => onChange('showHeader', v)} label={t(language, 'prop.showHeader')} />
        {tpl === 'ranking' && (
          <Toggle value={!!config.showRowNumbers} onChange={(v) => onChange('showRowNumbers', v)} label={t(language, 'prop.showRowNumbers')} />
        )}
      </Section>
    </div>
  )
}

/* ── Image properties ── */
function ImageProperties({ config, onChange }: { config: ImageBlockConfig; onChange: (p: string, v: unknown) => void }) {
  const { language } = useAppStore()
  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) return
    const reader = new FileReader()
    reader.onload = () => onChange('src', String(reader.result))
    reader.readAsDataURL(file)
  }

  const maskOptions: { value: ImageMaskShape; label: string }[] = [
    { value: 'none', label: t(language, 'prop.maskNone') },
    { value: 'rounded', label: t(language, 'prop.maskRounded') },
    { value: 'circle', label: t(language, 'prop.maskCircle') },
    { value: 'squircle', label: t(language, 'prop.maskSquircle') },
    { value: 'hexagon', label: t(language, 'prop.maskHexagon') },
    { value: 'star', label: t(language, 'prop.maskStar') },
    { value: 'blob', label: t(language, 'prop.maskBlob') },
    { value: 'rhombus', label: t(language, 'prop.maskRhombus') },
  ]

  return (
    <div className="space-y-3">
      <Section label={t(language, 'prop.image')}>
        <div className="flex gap-2">
          <label className="flex-1 cursor-pointer inline-flex items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition-colors hover:border-[var(--accent)]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-muted)', background: 'var(--surface-strong)' }}>
            <Plus size={12} /> {t(language, 'prop.upload')}
            <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          </label>
        </div>
        <Field label={t(language, 'prop.url')}><TextInput value={config.src || ''} onChange={(v) => onChange('src', v)} placeholder="https://..." /></Field>
        <Field label={t(language, 'prop.fit')}>
          <SelectInput value={config.fit || 'cover'} onChange={(v) => onChange('fit', v)}
            options={[{ value: 'cover', label: t(language, 'prop.fitCover') }, { value: 'contain', label: t(language, 'prop.fitContain') }, { value: 'fill', label: t(language, 'prop.fitFill') }]} />
        </Field>
      </Section>

      <Section label={t(language, 'prop.mask')}>
        <Field label={t(language, 'prop.mask')}>
          <SelectInput value={config.mask || 'none'} onChange={(v) => onChange('mask', v as ImageMaskShape)} options={maskOptions} />
        </Field>
        {(config.mask || 'none') === 'none' && (
          <Field label={t(language, 'prop.radius')}><NumInput value={config.borderRadius ?? 0} onChange={(v) => onChange('borderRadius', v)} min={0} max={100} /></Field>
        )}
      </Section>

      <Section label={t(language, 'prop.filters')}>
        <Field label={t(language, 'prop.brightness')}><NumInput value={config.brightness ?? 100} onChange={(v) => onChange('brightness', v)} min={0} max={200} /></Field>
        <Field label={t(language, 'prop.contrast')}><NumInput value={config.contrast ?? 100} onChange={(v) => onChange('contrast', v)} min={0} max={200} /></Field>
        <Field label={t(language, 'prop.saturation')}><NumInput value={config.saturation ?? 100} onChange={(v) => onChange('saturation', v)} min={0} max={200} /></Field>
        <Field label={t(language, 'prop.grayscale')}><NumInput value={config.grayscale ?? 0} onChange={(v) => onChange('grayscale', v)} min={0} max={100} /></Field>
        <Field label={t(language, 'prop.blur')}><NumInput value={config.blur ?? 0} onChange={(v) => onChange('blur', v)} min={0} max={10} step={0.5} /></Field>
      </Section>

      <Section label={t(language, 'prop.frame')}>
        <Field label={t(language, 'prop.borderColor')}><ColorInput value={config.borderColor || 'var(--accent)'} onChange={(v) => onChange('borderColor', v)} /></Field>
        <Field label={t(language, 'prop.thickness')}><NumInput value={config.borderWidth ?? 0} onChange={(v) => onChange('borderWidth', v)} min={0} max={10} /></Field>
        <Toggle value={!!config.shadow} onChange={(v) => onChange('shadow', v)} label={t(language, 'prop.shadow')} />
      </Section>

      <Section label={t(language, 'prop.caption')}>
        <Field label={t(language, 'prop.labelText')}><TextInput value={config.caption || ''} onChange={(v) => onChange('caption', v)} /></Field>
        <Field label={t(language, 'prop.textColor')}><ColorInput value={config.captionColor || '#ffffff'} onChange={(v) => onChange('captionColor', v)} /></Field>
      </Section>
    </div>
  )
}

function getShapeTypes(language: Language): { id: ShapeType; label: string }[] {
  return [
    { id: 'rectangle', label: t(language, 'shape.rectangle') },
    { id: 'circle', label: t(language, 'shape.circle') },
    { id: 'ellipse', label: t(language, 'shape.ellipse') },
    { id: 'triangle', label: t(language, 'shape.triangle') },
    { id: 'diamond', label: t(language, 'shape.diamond') },
    { id: 'pentagon', label: t(language, 'shape.pentagon') },
    { id: 'hexagon', label: t(language, 'shape.hexagon') },
    { id: 'star', label: t(language, 'shape.star') },
    { id: 'heart', label: t(language, 'shape.heart') },
    { id: 'cloud', label: t(language, 'shape.cloud') },
    { id: 'shield', label: t(language, 'shape.shield') },
    { id: 'speech', label: t(language, 'shape.speech') },
    { id: 'callout', label: t(language, 'shape.callout') },
    { id: 'ribbon', label: t(language, 'shape.ribbon') },
    { id: 'blob', label: t(language, 'shape.blob') },
    { id: 'cross', label: t(language, 'shape.cross') },
    { id: 'arrow-right', label: t(language, 'shape.arrowRight') },
    { id: 'arrow-up', label: t(language, 'shape.arrowUp') },
    { id: 'arrow-left', label: t(language, 'shape.arrowLeft') },
    { id: 'arrow-down', label: t(language, 'shape.arrowDown') },
    { id: 'arrow-double', label: t(language, 'shape.arrowDouble') },
    { id: 'line', label: t(language, 'shape.line') },
  ]
}

function getShapeCategories(language: Language): { id: 'basic' | 'badges' | 'arrows' | 'lines'; label: string }[] {
  return [
    { id: 'basic', label: t(language, 'shape.cat.basic') },
    { id: 'badges', label: t(language, 'shape.cat.badges') },
    { id: 'arrows', label: t(language, 'shape.cat.arrows') },
    { id: 'lines', label: t(language, 'shape.cat.lines') },
  ]
}

const SHAPE_CATEGORY_MAP: Record<ShapeType, 'basic' | 'badges' | 'arrows' | 'lines'> = {
  rectangle: 'basic',
  circle: 'basic',
  ellipse: 'basic',
  triangle: 'basic',
  diamond: 'basic',
  pentagon: 'basic',
  hexagon: 'basic',
  star: 'basic',
  cross: 'basic',
  heart: 'badges',
  cloud: 'badges',
  shield: 'badges',
  speech: 'badges',
  callout: 'badges',
  ribbon: 'badges',
  blob: 'badges',
  'arrow-right': 'arrows',
  'arrow-up': 'arrows',
  'arrow-left': 'arrows',
  'arrow-down': 'arrows',
  'arrow-double': 'arrows',
  line: 'lines',
}

function ShapeThumb({ shape, active }: { shape: ShapeType; active?: boolean }) {
  const stroke = active ? 'var(--accent)' : 'var(--text-subtle)'
  const fill = active ? 'var(--accent-soft)' : 'rgba(255,255,255,0.04)'
  const size = 56
  const w = 48
  const h = 32
  const padX = (size - w) / 2
  const padY = (size - h) / 2
  const d = shapePath(shape, w, h)

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <rect x={0} y={0} width={size} height={size} rx={10} ry={10} fill={fill} stroke="rgba(255,255,255,0.06)" />
      {shape === 'rectangle' && (
        <rect x={padX} y={padY} width={w} height={h} rx={8} ry={8} fill={fill} stroke={stroke} strokeWidth={2} />
      )}
      {shape === 'circle' && (
        <circle cx={size / 2} cy={size / 2} r={Math.min(w, h) / 2} fill={fill} stroke={stroke} strokeWidth={2} />
      )}
      {shape === 'ellipse' && (
        <ellipse cx={size / 2} cy={size / 2} rx={w / 2} ry={h / 2} fill={fill} stroke={stroke} strokeWidth={2} />
      )}
      {shape === 'line' && (
        <line x1={padX} y1={size / 2} x2={size - padX} y2={size / 2} stroke={stroke} strokeWidth={2.4} strokeLinecap="round" />
      )}
      {shape !== 'rectangle' && shape !== 'circle' && shape !== 'ellipse' && shape !== 'line' && (
        <path d={d} transform={`translate(${padX} ${padY})`} fill={fill} stroke={stroke} strokeWidth={2} strokeLinejoin="round" />
      )}
    </svg>
  )
}

/* ── Shape properties ── */
function ShapeProperties({ config, onChange }: { config: ShapeBlockConfig; onChange: (p: string, v: unknown) => void }) {
  const { language } = useAppStore()
  const isLine = config.shape === 'line'
  return (
    <div className="space-y-3">
      <Section label={t(language, 'picker.shape.title')}>
        <div className="grid grid-cols-3 gap-2">
          {getShapeTypes(language).map((s) => {
            const active = config.shape === s.id
            return (
              <button
                key={s.id}
                onClick={() => onChange('shape', s.id)}
                className="rounded-md border p-2 text-[10px] font-semibold transition-all"
                style={{
                  background: active ? 'var(--accent-soft)' : 'var(--surface-strong)',
                  borderColor: active ? 'var(--accent)' : 'var(--border)',
                  color: active ? 'var(--accent)' : 'var(--text)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                }}
              >
                <div style={{ width: 52, height: 52 }}>
                  <ShapeThumb shape={s.id} active={active} />
                </div>
                <div style={{ fontSize: 9, color: active ? 'var(--accent)' : 'var(--text-subtle)' }}>{s.label}</div>
              </button>
            )
          })}
        </div>
      </Section>

      <Section label={t(language, 'prop.fill')}>
        <Field label={t(language, 'prop.textColor')}><ColorInput value={config.fillColor || 'var(--accent)'} onChange={(v) => onChange('fillColor', v)} /></Field>
        <Field label={t(language, 'prop.opacity')}>
          <NumInput value={config.opacity ?? 1} onChange={(v) => onChange('opacity', v)} min={0.1} max={1} step={0.05} />
        </Field>
        <Toggle value={!!config.gradient} onChange={(v) => onChange('gradient', v)} label={t(language, 'prop.gradient')} />
        {config.gradient && (
          <>
            <Field label={t(language, 'prop.gradientTo')}><ColorInput value={config.gradientTo || ''} onChange={(v) => onChange('gradientTo', v)} /></Field>
            <Field label={t(language, 'prop.gradientAngle')}><NumInput value={config.gradientAngle ?? 135} onChange={(v) => onChange('gradientAngle', v)} min={0} max={360} /></Field>
          </>
        )}
      </Section>

      <Section label={t(language, 'prop.outline')}>
        <Field label={t(language, 'prop.textColor')}><ColorInput value={config.strokeColor || 'transparent'} onChange={(v) => onChange('strokeColor', v)} /></Field>
        <Field label={t(language, 'prop.thickness')}><NumInput value={config.strokeWidth ?? 0} onChange={(v) => onChange('strokeWidth', v)} min={0} max={20} /></Field>
      </Section>

      {config.shape === 'rectangle' && (
        <Section label={t(language, 'prop.corners')}>
          <Field label={t(language, 'prop.radius')}><NumInput value={config.rounded ?? 0} onChange={(v) => onChange('rounded', v)} min={0} max={100} /></Field>
        </Section>
      )}

      {isLine && (
        <Section label="Linha">
          <Field label={t(language, 'prop.shapeLineStyle')}>
            <SelectInput value={config.lineStyle || 'solid'} onChange={(v) => onChange('lineStyle', v)}
              options={[{ value: 'solid', label: t(language, 'prop.dashSolid') }, { value: 'dashed', label: t(language, 'prop.dashDashed') }, { value: 'dotted', label: t(language, 'prop.dashDotted') }]} />
          </Field>
          <Toggle value={!!config.lineStartArrow} onChange={(v) => onChange('lineStartArrow', v)} label={t(language, 'prop.lineStartArrow')} />
          <Toggle value={!!config.lineEndArrow} onChange={(v) => onChange('lineEndArrow', v)} label={t(language, 'prop.lineEndArrow')} />
          <div className="rounded-md border px-3 py-2 text-[10px] leading-relaxed mt-1"
            style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
            {t(language, 'prop.shapeLineTip')}
          </div>
        </Section>
      )}

      <Section label={t(language, 'prop.transform')}>
        <Field label={t(language, 'prop.rotation')}><NumInput value={config.rotation ?? 0} onChange={(v) => onChange('rotation', v)} min={0} max={360} /></Field>
        <Toggle value={!!config.shadow} onChange={(v) => onChange('shadow', v)} label={t(language, 'prop.shadow')} />
      </Section>
    </div>
  )
}

/* ── Divider properties ── */
function DividerProperties({ config, onChange }: { config: DividerBlockConfig; onChange: (p: string, v: unknown) => void }) {
  const { language } = useAppStore()
  return (
    <div className="space-y-3">
      <Section label={t(language, 'prop.connectorStyle')}>
        <Field label={t(language, 'prop.orientation')}>
          <SelectInput value={config.orientation || 'horizontal'} onChange={(v) => onChange('orientation', v)}
            options={[{ value: 'horizontal', label: t(language, 'prop.horizontal') }, { value: 'vertical', label: t(language, 'prop.vertical') }]} />
        </Field>
        <Field label={t(language, 'prop.style')}>
          <SelectInput value={config.style || 'solid'} onChange={(v) => onChange('style', v)}
            options={[{ value: 'solid', label: t(language, 'prop.dashSolid') }, { value: 'dashed', label: t(language, 'prop.dashDashed') }, { value: 'dotted', label: t(language, 'prop.dashDotted') }]} />
        </Field>
        <Field label={t(language, 'prop.thickness')}><NumInput value={config.thickness || 1} onChange={(v) => onChange('thickness', v)} min={1} max={8} /></Field>
        <Field label={t(language, 'prop.textColor')}><ColorInput value={config.color || 'var(--border)'} onChange={(v) => onChange('color', v)} /></Field>
        <Field label={t(language, 'prop.labelText')}><TextInput value={config.label || ''} onChange={(v) => onChange('label', v)} placeholder={t(language, 'prop.optional')} /></Field>
      </Section>
    </div>
  )
}
