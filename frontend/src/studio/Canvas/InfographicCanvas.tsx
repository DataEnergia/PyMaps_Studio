import { useRef, useEffect, useCallback, useState } from 'react'
import type { Block } from '../types'
import { useStudioStore } from '../store/studioStore'
import BlockRenderer from './BlockRenderer'
import ConnectorsLayer from './ConnectorsLayer'
import ExportOverlay from '../ExportOverlay'

export default function InfographicCanvas() {
  const {
    spec, selectedBlockId, selectedBlockIds,
    selectBlock, toggleBlockSelection, selectAllBlocks, clearSelection,
    canvasZoom, showGrid, showGuides,
    updateSpecMetadata,
  } = useStudioStore()
  const boardRef = useRef<HTMLDivElement>(null)
  const guidesRef = useRef<{ h: number[]; v: number[] }>({ h: [], v: [] })
  const [guides, setGuides] = useState<{ h: number[]; v: number[] }>({ h: [], v: [] })
  const [dragGuide, setDragGuide] = useState<{ type: 'h' | 'v'; index: number } | null>(null)
  const [guideDragPos, setGuideDragPos] = useState<number | null>(null)
  const RULER_SIZE = 18
  const PAGE_GAP = 10

  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const marqueeActive = useRef(false)
  const marqueeStart = useRef({ x: 0, y: 0 })
  const marqueeAdditive = useRef(false)

  if (!spec) {
    return (
      <main className="flex-1 flex items-center justify-center relative" style={{ background: 'var(--bg)' }}>
        <div className="text-center space-y-3">
          <div
            className="mx-auto h-14 w-14 rounded-2xl border-2 border-dashed flex items-center justify-center"
            style={{ borderColor: 'var(--border)' }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-subtle)" strokeWidth="1.5" opacity={0.35}>
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="8" y1="8" x2="16" y2="8" />
              <line x1="8" y1="12" x2="16" y2="12" />
              <line x1="8" y1="16" x2="12" y2="16" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>Canvas vazio</p>
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-subtle)' }}>Adicione blocos pelo painel direito</p>
          </div>
        </div>
      </main>
    )
  }

  const { canvas, blocks } = spec
  const metadata = spec.metadata || {}
  const guideOffset = showGuides ? RULER_SIZE : 0
  const boardOffset = showGuides ? RULER_SIZE + PAGE_GAP : 0

  useEffect(() => {
    const raw = (metadata.guides as { h?: number[]; v?: number[] } | undefined) || {}
    const h = Array.isArray(raw.h) ? raw.h.filter((n) => Number.isFinite(n)) : []
    const v = Array.isArray(raw.v) ? raw.v.filter((n) => Number.isFinite(n)) : []
    guidesRef.current = { h, v }
    setGuides({ h, v })
  }, [metadata.guides])
  const otherBlocks = blocks.filter((b) => b.type !== 'connector')
  const isMulti = selectedBlockIds.length > 1

  /* ── Ctrl+A to select all ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        const target = e.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
        e.preventDefault()
        selectAllBlocks()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectAllBlocks])

  /* ── Marquee selection ── */
  const toBoardCoords = useCallback((clientX: number, clientY: number) => {
    const board = boardRef.current
    if (!board) return { x: 0, y: 0 }
    const rect = board.getBoundingClientRect()
    const scale = canvasZoom / 100
    return {
      x: (clientX - rect.left) / scale,
      y: (clientY - rect.top) / scale,
    }
  }, [canvasZoom])

  const toBoardCoord = useCallback((clientX: number, clientY: number) => {
    const board = boardRef.current
    if (!board) return { x: 0, y: 0 }
    const rect = board.getBoundingClientRect()
    const scale = canvasZoom / 100
    return {
      x: (clientX - rect.left) / scale,
      y: (clientY - rect.top) / scale,
    }
  }, [canvasZoom])

  const handleBoardMouseDown = useCallback((e: React.MouseEvent) => {
    if (dragGuide) return
    // Only start marquee if clicking directly on the board background (not on a block or floating toolbar)
    const target = e.target as HTMLElement
    if (target.closest('[data-guide-line]') || target.closest('[data-guide-ruler]')) return
    const clickedBlock = target.closest('[data-block-id]')
    if (clickedBlock) return
    const clickedToolbar = target.closest('[data-text-toolbar]')
    if (clickedToolbar) return

    e.preventDefault()
    marqueeActive.current = true
    marqueeAdditive.current = e.shiftKey || e.ctrlKey || e.metaKey
    const pt = toBoardCoords(e.clientX, e.clientY)
    marqueeStart.current = pt
    setMarquee({ x: pt.x, y: pt.y, w: 0, h: 0 })
  }, [toBoardCoords])

  const handleBoardMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragGuide) return
    if (!marqueeActive.current) return
    const pt = toBoardCoords(e.clientX, e.clientY)
    const sx = marqueeStart.current.x
    const sy = marqueeStart.current.y
    setMarquee({
      x: Math.min(sx, pt.x),
      y: Math.min(sy, pt.y),
      w: Math.abs(pt.x - sx),
      h: Math.abs(pt.y - sy),
    })
  }, [toBoardCoords])

  const handleBoardMouseUp = useCallback(() => {
    if (dragGuide) return
    if (!marqueeActive.current) return
    marqueeActive.current = false

    if (marquee && marquee.w > 4 && marquee.h > 4) {
      const inside = blocks
        .filter((b) => {
          const bx = b.bounds.x, by = b.bounds.y, bw = b.bounds.w, bh = b.bounds.h
          return (
            bx < marquee.x + marquee.w &&
            bx + bw > marquee.x &&
            by < marquee.y + marquee.h &&
            by + bh > marquee.y
          )
        })
        .map((b) => b.id)
      const store = useStudioStore.getState()
      if (marqueeAdditive.current) {
        const merged = Array.from(new Set([...selectedBlockIds, ...inside]))
        store.spec && useStudioStore.setState({
          selectedBlockIds: merged,
          selectedBlockId: merged.length > 0 ? merged[merged.length - 1] : null,
        })
      } else if (inside.length > 0) {
        useStudioStore.setState({
          selectedBlockIds: inside,
          selectedBlockId: inside[inside.length - 1],
        })
      } else {
        clearSelection()
      }
    }
    setMarquee(null)
  }, [marquee, blocks, selectedBlockIds, clearSelection])

  /* ── Click on empty canvas clears selection (only if not marquee drag or toolbar) ── */
  const handleBoardClick = useCallback((e: React.MouseEvent) => {
    if (dragGuide) return
    const target = e.target as HTMLElement
    if (target.closest('[data-guide-line]') || target.closest('[data-guide-ruler]')) return
    const clickedBlock = target.closest('[data-block-id]')
    if (clickedBlock) return
    const clickedToolbar = target.closest('[data-text-toolbar]')
    if (clickedToolbar) return
    if (marqueeActive.current) return
    clearSelection()
  }, [clearSelection])

  const startGuideDrag = useCallback((type: 'h' | 'v', index: number | null, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const pt = toBoardCoord(e.clientX, e.clientY)
    const rawPos = type === 'h' ? pt.y : pt.x
    const max = type === 'h' ? canvas.height : canvas.width
    const pos = Math.max(0, Math.min(max, rawPos))
    if (index === null) {
      const next = { ...guidesRef.current }
      const arr = type === 'h' ? next.h : next.v
      arr.push(pos)
      arr.sort((a, b) => a - b)
      guidesRef.current = next
      setGuides({ ...next })
      updateSpecMetadata({ guides: next })
      const newIndex = arr.indexOf(pos)
      setDragGuide({ type, index: newIndex })
    } else {
      setDragGuide({ type, index })
    }
    setGuideDragPos(pos)
  }, [toBoardCoord, updateSpecMetadata, canvas.height, canvas.width])

  useEffect(() => {
    if (!dragGuide) return
    const onMove = (ev: MouseEvent) => {
      const pt = toBoardCoord(ev.clientX, ev.clientY)
      const pos = dragGuide.type === 'h' ? pt.y : pt.x
      setGuideDragPos(pos)
    }
    const onUp = () => {
      const current = { ...guidesRef.current }
      const arr = dragGuide.type === 'h' ? [...current.h] : [...current.v]
      const pos = guideDragPos
      if (pos !== null) {
        const within = dragGuide.type === 'h'
          ? pos >= -20 && pos <= canvas.height + 20
          : pos >= -20 && pos <= canvas.width + 20
        if (within) {
          arr[dragGuide.index] = Math.round(pos)
        } else {
          arr.splice(dragGuide.index, 1)
        }
      }
      const next = dragGuide.type === 'h'
        ? { h: arr.filter((n) => Number.isFinite(n)), v: current.v }
        : { h: current.h, v: arr.filter((n) => Number.isFinite(n)) }
      next.h.sort((a, b) => a - b)
      next.v.sort((a, b) => a - b)
      guidesRef.current = next
      setGuides(next)
      updateSpecMetadata({ guides: next })
      setDragGuide(null)
      setGuideDragPos(null)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [dragGuide, guideDragPos, canvas.height, canvas.width, toBoardCoord, updateSpecMetadata])

  /* ── Compute group bbox ── */
  const groupBbox = (() => {
    if (!isMulti) return null
    const selected = blocks.filter((b) => selectedBlockIds.includes(b.id))
    if (selected.length === 0) return null
    const minX = Math.min(...selected.map((b) => b.bounds.x))
    const minY = Math.min(...selected.map((b) => b.bounds.y))
    const maxX = Math.max(...selected.map((b) => b.bounds.x + b.bounds.w))
    const maxY = Math.max(...selected.map((b) => b.bounds.y + b.bounds.h))
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
  })()

  return (
    <main className="flex-1 flex items-center justify-center relative overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* Subtle ambient background */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: `radial-gradient(circle at 20% 20%, rgba(125,140,160,0.08), transparent 50%),
          linear-gradient(135deg, rgba(45,55,72,0.06), transparent 55%)`,
      }} />

      {/* Grid pattern */}
      {showGrid && (
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: `linear-gradient(var(--gridline) 1px, transparent 1px),
            linear-gradient(90deg, var(--gridline) 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
          opacity: 0.4,
        }} />
      )}

      {/* Canvas Stage (board + rulers) */}
      <div
        className="relative flex-none"
        style={{
          width: canvas.width + boardOffset,
          height: canvas.height + boardOffset,
          transform: `scale(${canvasZoom / 100})`,
          transformOrigin: 'center center',
          transition: 'transform 0.15s ease',
        }}
      >
        {/* Rulers */}
        {showGuides && (
          <>
            <div
              data-guide-ruler="h"
              onMouseDown={(e) => startGuideDrag('h', null, e)}
              style={{
                position: 'absolute', left: guideOffset, right: 0, top: 0, height: RULER_SIZE,
                background: 'var(--ruler-bg)', borderBottom: '1px solid var(--ruler-border)',
                cursor: 'row-resize', zIndex: 40,
              }}
            >
              <div style={{ display: 'flex', height: '100%', opacity: 0.7 }}>
                <div style={{ width: PAGE_GAP }} />
                {Array.from({ length: Math.ceil(canvas.width / 100) }).map((_, i) => (
                  <div key={i} style={{ width: 100, borderRight: '1px solid var(--ruler-tick)', fontSize: 9, color: 'var(--ruler-text)', paddingLeft: 6, lineHeight: '18px' }}>
                    {i * 100}
                  </div>
                ))}
              </div>
            </div>
            <div
              data-guide-ruler="v"
              onMouseDown={(e) => startGuideDrag('v', null, e)}
              style={{
                position: 'absolute', top: guideOffset, bottom: 0, left: 0, width: RULER_SIZE,
                background: 'var(--ruler-bg)', borderRight: '1px solid var(--ruler-border)',
                cursor: 'col-resize', zIndex: 40,
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', opacity: 0.7 }}>
                <div style={{ height: PAGE_GAP }} />
                {Array.from({ length: Math.ceil(canvas.height / 100) }).map((_, i) => (
                  <div key={i} style={{ height: 100, borderBottom: '1px solid var(--ruler-tick)', fontSize: 9, color: 'var(--ruler-text)', paddingTop: 6, writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                    {i * 100}
                  </div>
                ))}
              </div>
            </div>
            <div style={{ position: 'absolute', left: 0, top: 0, width: RULER_SIZE, height: RULER_SIZE, background: 'var(--ruler-bg)', borderRight: '1px solid var(--ruler-border)', borderBottom: '1px solid var(--ruler-border)' }} />
          </>
        )}

        {/* Canvas Board */}
        <div
          ref={boardRef}
          data-studio-board="true"
          className="absolute"
          style={{
            left: boardOffset,
            top: boardOffset,
            width: canvas.width,
            height: canvas.height,
            background: canvas.background || 'var(--surface)',
            borderRadius: 0,
            boxShadow: '0 6px 28px rgba(0,0,0,0.10), 0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px var(--border)',
            overflow: 'hidden',
          }}
          onMouseDown={handleBoardMouseDown}
          onMouseMove={handleBoardMouseMove}
          onMouseUp={handleBoardMouseUp}
          onClick={handleBoardClick}
        >
        {/* Inner grid */}
        {showGrid && (
          <div className="absolute inset-0 pointer-events-none" style={{
            backgroundImage: `linear-gradient(transparent 95%, var(--gridline) 95%),
              linear-gradient(90deg, transparent 95%, var(--gridline) 95%)`,
            backgroundSize: '24px 24px',
            zIndex: 0,
          }} />
        )}

        {/* Guides */}
        {showGuides && (
          <>
            {guides.h.map((y, idx) => (
              <div
                key={`h-${idx}`}
                data-guide-line="true"
                onMouseDown={(e) => startGuideDrag('h', idx, e)}
                style={{
                  position: 'absolute', left: 0, right: 0, top: y + boardOffset,
                  height: 0, borderTop: '1px solid var(--guide-line)',
                  zIndex: 45,
                  cursor: 'row-resize',
                }}
              />
            ))}
            {guides.v.map((x, idx) => (
              <div
                key={`v-${idx}`}
                data-guide-line="true"
                onMouseDown={(e) => startGuideDrag('v', idx, e)}
                style={{
                  position: 'absolute', top: 0, bottom: 0, left: x + boardOffset,
                  width: 0, borderLeft: '1px solid var(--guide-line)',
                  zIndex: 45,
                  cursor: 'col-resize',
                }}
              />
            ))}

            {dragGuide && guideDragPos !== null && (
              dragGuide.type === 'h'
                ? <div style={{ position: 'absolute', left: 0, right: 0, top: guideDragPos + boardOffset, borderTop: '1px dashed var(--guide-line-soft)', zIndex: 46 }} />
                : <div style={{ position: 'absolute', top: 0, bottom: 0, left: guideDragPos + boardOffset, borderLeft: '1px dashed var(--guide-line-soft)', zIndex: 46 }} />
            )}
          </>
        )}

        {/* Marquee selection rectangle */}
        {marquee && (
          <div
            className="absolute pointer-events-none"
            style={{
              left: marquee.x,
              top: marquee.y,
              width: marquee.w,
              height: marquee.h,
              background: 'rgba(59,130,246,0.12)',
              border: '1px solid rgba(59,130,246,0.45)',
              zIndex: 60,
            }}
          />
        )}

        {/* Group selection bbox */}
        {groupBbox && (
          <GroupSelectionOverlay bbox={groupBbox} selectedIds={selectedBlockIds} />
        )}

        {/* Connectors render in their own canvas-absolute SVG layer below blocks */}
        <ConnectorsLayer blocks={blocks} canvasW={canvas.width} canvasH={canvas.height} />

        {otherBlocks.map((block) => (
          <BlockRenderer
            key={block.id}
            block={block}
            isSelected={selectedBlockId === block.id}
            isMultiSelected={isMulti && selectedBlockIds.includes(block.id)}
            onClick={(e) => {
              if (e.shiftKey || e.ctrlKey || e.metaKey) {
                toggleBlockSelection(block.id)
              } else if (selectedBlockIds.includes(block.id) && isMulti) {
                /* Already part of group selection — don't replace */
                return
              } else {
                selectBlock(block.id)
              }
            }}
            allBlocks={blocks}
          />
        ))}

        {/* Canvas info badge */}
        <div
          className="absolute flex items-center gap-1.5 rounded-md px-2 py-0.5"
          style={{
            bottom: 8,
            right: 10,
            fontSize: 9,
            color: 'var(--text-subtle)',
            fontFamily: 'var(--font-condensed)',
            letterSpacing: '0.3px',
            zIndex: 20,
            pointerEvents: 'none',
            background: 'rgba(30,40,55,0.8)',
            backdropFilter: 'blur(4px)',
          }}
        >
          <span className="inline-block h-1 w-1 rounded-full bg-[var(--accent)]" />
          {canvas.width} × {canvas.height}px
        </div>

        {/* Export selection overlay */}
        <ExportOverlay />
        </div>
      </div>
    </main>
  )
}

/* ── Group selection overlay with move + resize ── */
type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

function GroupSelectionOverlay({ bbox, selectedIds }: { bbox: { x: number; y: number; w: number; h: number }; selectedIds: string[] }) {
  const { updateBlocks, spec } = useStudioStore()
  const draggingRef = useRef(false)
  const resizingRef = useRef<ResizeHandle | null>(null)
  const startRef = useRef({ x: 0, y: 0, bx: 0, by: 0, bw: 0, bh: 0 })

  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    draggingRef.current = true
    resizingRef.current = null
    startRef.current = { x: e.clientX, y: e.clientY, bx: bbox.x, by: bbox.y, bw: bbox.w, bh: bbox.h }

    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current || !spec) return
      const scale = useStudioStore.getState().canvasZoom / 100
      const dx = (ev.clientX - startRef.current.x) / scale
      const dy = (ev.clientY - startRef.current.y) / scale

      const updates: Record<string, Partial<Block>> = {}
      for (const block of spec.blocks) {
        if (selectedIds.includes(block.id)) {
          updates[block.id] = {
            bounds: {
              x: Math.max(0, Math.round(block.bounds.x + dx)),
              y: Math.max(0, Math.round(block.bounds.y + dy)),
              w: block.bounds.w,
              h: block.bounds.h,
            },
          }
        }
      }
      updateBlocks(updates)
    }

    const onUp = () => {
      draggingRef.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const handleResizeStart = (e: React.MouseEvent, handle: ResizeHandle) => {
    e.stopPropagation()
    e.preventDefault()
    resizingRef.current = handle
    startRef.current = { x: e.clientX, y: e.clientY, bx: bbox.x, by: bbox.y, bw: bbox.w, bh: bbox.h }

    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current || !spec) return
      const scale = useStudioStore.getState().canvasZoom / 100
      const dx = (ev.clientX - startRef.current.x) / scale
      const dy = (ev.clientY - startRef.current.y) / scale

      let nx = startRef.current.bx
      let ny = startRef.current.by
      let nw = startRef.current.bw
      let nh = startRef.current.bh

      const h = resizingRef.current
      if (h.includes('e')) nw = Math.max(24, startRef.current.bw + dx)
      if (h.includes('s')) nh = Math.max(24, startRef.current.bh + dy)
      if (h.includes('w')) { nw = Math.max(24, startRef.current.bw - dx); nx = startRef.current.bx + (startRef.current.bw - nw) }
      if (h.includes('n')) { nh = Math.max(24, startRef.current.bh - dy); ny = startRef.current.by + (startRef.current.bh - nh) }

      const scaleX = nw / startRef.current.bw
      const scaleY = nh / startRef.current.bh
      const originX = nx
      const originY = ny

      const updates: Record<string, Partial<Block>> = {}
      for (const block of spec.blocks) {
        if (selectedIds.includes(block.id)) {
          const bx = block.bounds.x
          const by = block.bounds.y
          const bw = block.bounds.w
          const bh = block.bounds.h

          // Proportional resize relative to the group's top-left corner
          const newX = Math.round(originX + (bx - startRef.current.bx) * scaleX)
          const newY = Math.round(originY + (by - startRef.current.by) * scaleY)
          const newW = Math.max(12, Math.round(bw * scaleX))
          const newH = Math.max(12, Math.round(bh * scaleY))

          updates[block.id] = {
            bounds: {
              x: Math.max(0, newX),
              y: Math.max(0, newY),
              w: newW,
              h: newH,
            },
          }
        }
      }
      updateBlocks(updates)
    }

    const onUp = () => {
      resizingRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  const getHandleStyle = (handle: ResizeHandle): React.CSSProperties => {
    const s = 8
    const h2 = s / 2
    const pos: Record<ResizeHandle, React.CSSProperties> = {
      n: { left: '50%', top: -h2 - 4, marginLeft: -h2, cursor: 'ns-resize' },
      s: { left: '50%', bottom: -h2 - 4, marginLeft: -h2, cursor: 'ns-resize' },
      e: { right: -h2 - 4, top: '50%', marginTop: -h2, cursor: 'ew-resize' },
      w: { left: -h2 - 4, top: '50%', marginTop: -h2, cursor: 'ew-resize' },
      ne: { right: -h2 - 4, top: -h2 - 4, cursor: 'nesw-resize' },
      nw: { left: -h2 - 4, top: -h2 - 4, cursor: 'nwse-resize' },
      se: { right: -h2 - 4, bottom: -h2 - 4, cursor: 'nwse-resize' },
      sw: { left: -h2 - 4, bottom: -h2 - 4, cursor: 'nesw-resize' },
    }
    return {
      position: 'absolute',
      width: s,
      height: s,
      borderRadius: 2,
      background: 'var(--accent)',
      border: '1.5px solid var(--surface)',
      zIndex: 100,
      ...pos[handle],
    }
  }

  return (
    <div
      className="absolute pointer-events-auto"
      style={{
        left: bbox.x,
        top: bbox.y,
        width: bbox.w,
        height: bbox.h,
        zIndex: 50,
        outline: '2px dashed var(--accent)',
        outlineOffset: 4,
        borderRadius: 4,
        cursor: 'move',
      }}
      onMouseDown={handleMouseDown}
      title={`${selectedIds.length} blocos selecionados — arraste para mover`}
    >
      {/* Badge count */}
      <div
        className="absolute -top-5 left-0 px-1.5 py-0.5 rounded text-[9px] font-semibold"
        style={{
          background: 'var(--accent)',
          color: '#fff',
          pointerEvents: 'none',
        }}
      >
        {selectedIds.length}
      </div>

      {/* Resize handles */}
      {(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as ResizeHandle[]).map((h) => (
        <div key={h} data-handle={h} style={getHandleStyle(h)} onMouseDown={(e) => handleResizeStart(e, h)} />
      ))}
    </div>
  )
}
