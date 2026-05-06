import { useState, useRef, useEffect, useCallback } from 'react'
import { useStudioStore, type ExportSelection } from './store/studioStore'
import { buildSVG, svgToPng, svgToJpeg, downloadBlob } from './export/svgExport'
import { useAppStore } from '../stores/appStore'
import { t } from '../i18n'

export default function ExportOverlay() {
  const { language } = useAppStore()
  const {
    exportMode,
    exportSelection,
    exportFormat,
    exportQuality,
    setExportMode,
    setExportSelection,
    setExportFormat,
    setExportQuality,
  } = useStudioStore()

  const isSelecting = exportMode === 'selecting'

  const [dragging, setDragging] = useState(false)
  const [rect, setRect] = useState<ExportSelection | null>(null)

  const startRef = useRef({ x: 0, y: 0 })
  const rectRef = useRef<ExportSelection | null>(null)
  const boardRef = useRef<HTMLElement | null>(null)

  const updateRect = useCallback((r: ExportSelection | null) => {
    rectRef.current = r
    setRect(r)
  }, [])

  useEffect(() => {
    boardRef.current = document.querySelector('[data-studio-board]') as HTMLElement | null
  }, [])

  const toLocal = useCallback((clientX: number, clientY: number) => {
    const board = boardRef.current
    if (!board) return { x: 0, y: 0 }
    const br = board.getBoundingClientRect()
    // Convert from screen pixels back to board-local pixels (undo canvasZoom).
    const scale = useStudioStore.getState().canvasZoom / 100
    return {
      x: (clientX - br.left) / scale,
      y: (clientY - br.top) / scale,
    }
  }, [])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!isSelecting) return
      e.preventDefault()
      e.stopPropagation()
      const p = toLocal(e.clientX, e.clientY)
      startRef.current = p
      updateRect({ x: p.x, y: p.y, w: 0, h: 0 })
      setDragging(true)
      setExportSelection(null)
    },
    [isSelecting, toLocal, updateRect, setExportSelection]
  )

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => {
      const p = toLocal(e.clientX, e.clientY)
      const x = Math.min(startRef.current.x, p.x)
      const y = Math.min(startRef.current.y, p.y)
      const w = Math.abs(p.x - startRef.current.x)
      const h = Math.abs(p.y - startRef.current.y)
      updateRect({ x, y, w, h })
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [dragging, toLocal, updateRect])

  useEffect(() => {
    if (!dragging) return
    const onUp = () => {
      setDragging(false)
      const r = rectRef.current
      if (r && r.w > 10 && r.h > 10) {
        setExportSelection(r)
      } else {
        updateRect(null)
        setExportSelection(null)
      }
    }
    window.addEventListener('mouseup', onUp)
    return () => window.removeEventListener('mouseup', onUp)
  }, [dragging, setExportSelection, updateRect])

  useEffect(() => {
    if (!isSelecting) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExportMode('idle')
        setExportSelection(null)
        updateRect(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isSelecting, setExportMode, setExportSelection, updateRect])

  /* ── Export handler — single SVG-first pipeline for every format ── */
  const handleExport = useCallback(async () => {
    if (!exportSelection) return
    const spec = useStudioStore.getState().spec
    if (!spec) return

    setExportMode('capturing')
    // Yield so MapLibre instances finish any pending paint and the registry
    // entries pick up the latest snapshot.
    await new Promise((r) => setTimeout(r, 80))

    const sel = exportSelection
    const ts = Date.now()

    let svg = ''
    try {
      // Build the vector SVG once. This is the single source of truth —
      // PNG/JPG/PDF are all rasterizations of this same SVG.
      svg = await buildSVG(spec, sel)

      if (exportFormat === 'svg') {
        downloadBlob(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `infografico-${ts}.svg`)
      } else if (exportFormat === 'png') {
        const blob = await svgToPng(svg, exportQuality * 2)
        downloadBlob(blob, `infografico-${ts}.png`)
      } else if (exportFormat === 'jpg') {
        const blob = await svgToJpeg(svg, exportQuality * 2, '#ffffff')
        downloadBlob(blob, `infografico-${ts}.jpg`)
      } else if (exportFormat === 'pdf') {
        const { default: jsPDF } = await import('jspdf')
        const pngBlob = await svgToPng(svg, exportQuality * 2)
        const dataUrl = await new Promise<string>((res) => {
          const fr = new FileReader()
          fr.onload = () => res(String(fr.result))
          fr.readAsDataURL(pngBlob)
        })
        const pdf = new jsPDF({
          orientation: sel.w > sel.h ? 'l' : 'p',
          unit: 'px',
          format: [sel.w, sel.h],
        })
        pdf.addImage(dataUrl, 'PNG', 0, 0, sel.w, sel.h)
        pdf.save(`infografico-${ts}.pdf`)
      }
    } catch (err: any) {
      console.error('Export error:', err)
      // Debug: download the raw SVG so we can inspect it
      if (typeof svg === 'string' && svg.length > 0) {
        const debugBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
        const debugUrl = URL.createObjectURL(debugBlob)
        const a = document.createElement('a')
        a.href = debugUrl
        a.download = `debug-export.svg`
        a.click()
        setTimeout(() => URL.revokeObjectURL(debugUrl), 5000)
      }
      alert(`${t(language, 'export.error')}: ${err?.message || t(language, 'export.checkConsole')}\n${t(language, 'export.debugDownloaded')}`)
    } finally {
      setExportMode('idle')
      setExportSelection(null)
      updateRect(null)
    }
  }, [
    exportSelection,
    exportFormat,
    exportQuality,
    setExportMode,
    setExportSelection,
    updateRect,
  ])

  if (!isSelecting && exportMode !== 'capturing') return null

  const hasSelection = exportSelection && exportSelection.w > 0 && exportSelection.h > 0

  return (
    <div
      onMouseDown={handleMouseDown}
      className="export-overlay"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 9999,
        cursor: isSelecting ? 'crosshair' : 'default',
        background: isSelecting ? 'rgba(0,0,0,0.18)' : 'transparent',
      }}
    >
      {/* Selection rectangle */}
      {rect && rect.w > 0 && rect.h > 0 && (
        <div
          style={{
            position: 'absolute',
            left: rect.x,
            top: rect.y,
            width: rect.w,
            height: rect.h,
            border: '2px dashed var(--accent)',
            background: 'rgba(125,140,160,0.12)',
            pointerEvents: 'none',
            zIndex: 51,
          }}
        />
      )}

      {/* Controls bar */}
      {isSelecting && hasSelection && (
        <div
          className="rounded-lg border shadow-xl"
          style={{
            position: 'absolute',
            bottom: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--surface)',
            borderColor: 'var(--border)',
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            zIndex: 52,
          }}
        >
          <div className="text-[11px] whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
            <span className="font-semibold" style={{ color: 'var(--text)' }}>
              {Math.round(exportSelection!.w)} × {Math.round(exportSelection!.h)}px
            </span>
          </div>

          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as 'png' | 'jpg' | 'svg' | 'pdf')}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              padding: '3px 6px',
              borderRadius: 4,
              border: '1px solid var(--border)',
              background: 'var(--surface-strong)',
              color: 'var(--text-muted)',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            <option value="svg">{t(language, 'export.formatSvg')}</option>
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
            <option value="pdf">PDF</option>
          </select>

          <select
            value={exportQuality}
            onChange={(e) => setExportQuality(Number(e.target.value) as 1 | 2 | 3)}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              padding: '3px 6px',
              borderRadius: 4,
              border: '1px solid var(--border)',
              background: 'var(--surface-strong)',
              color: 'var(--text-muted)',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={3}>3x ({t(language, 'export.hq')})</option>
          </select>

          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={handleExport}
            style={{
              padding: '4px 10px',
              borderRadius: 4,
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {t(language, 'export.exportArea')}
          </button>
        </div>
      )}

      {/* Hint text */}
      {isSelecting && !hasSelection && (
        <div
          className="text-sm font-medium pointer-events-none select-none"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: '#fff',
            textShadow: '0 1px 4px rgba(0,0,0,0.5)',
            textAlign: 'center',
          }}
        >
          {t(language, 'export.selectHint')}
          <br />
          <span className="text-[11px] opacity-70">{t(language, 'export.escToCancel')}</span>
        </div>
      )}
    </div>
  )
}
