import { useRef, useState, useEffect, useCallback } from 'react'
import { GripVertical } from 'lucide-react'
import type { Block } from '../types'
import { useStudioStore } from '../store/studioStore'
import StudioMapBlock from './blocks/StudioMapBlock'
import CardBlock from './blocks/CardBlock'
import ChartBlock from './blocks/ChartBlock'
import TextBlock from './blocks/TextBlock'
import TableBlock from './blocks/TableBlock'
import ImageBlock from './blocks/ImageBlock'
import ShapeBlock from './blocks/ShapeBlock'
import TimelineBlock from './blocks/TimelineBlock'
import MinimapBlock from './blocks/MinimapBlock'
import DividerBlock from './blocks/DividerBlock'

interface Props {
  block: Block
  isSelected: boolean
  isMultiSelected?: boolean
  onClick: (e: React.MouseEvent) => void
  allBlocks: Block[]
}

type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const HANDLE_SIZE = 8
const MIN_SIZE = 24

function isLineShape(block: Block): boolean {
  if (block.type !== 'shape') return false
  const cfg = block.config as { shape?: string }
  return cfg?.shape === 'line'
}

export default function BlockRenderer({ block, isSelected, isMultiSelected, onClick }: Props) {
  const { updateBlock, updateBlocks } = useStudioStore()
  const [dragging, setDragging] = useState(false)
  const [resizing, setResizing] = useState<ResizeHandle | null>(null)
  const startRef = useRef({ x: 0, y: 0, bx: 0, by: 0, bw: 0, bh: 0 })
  const groupSnapshot = useRef<Array<{ id: string; bx: number; by: number }>>([])

  const { x, y, w, h } = block.bounds
  const z = block.zIndex ?? 0

  /* Connectors render via the canvas-level layer (not here). */
  if (block.type === 'connector') return null

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    onClick(e)
    setDragging(true)
    startRef.current = {
      x: e.clientX, y: e.clientY,
      bx: block.bounds.x, by: block.bounds.y,
      bw: block.bounds.w, bh: block.bounds.h,
    }
    /* Snapshot all selected block positions (for group move). */
    const state = useStudioStore.getState()
    if (state.selectedBlockIds.includes(block.id) && state.selectedBlockIds.length > 1 && state.spec) {
      groupSnapshot.current = state.spec.blocks
        .filter((b) => state.selectedBlockIds.includes(b.id))
        .map((b) => ({ id: b.id, bx: b.bounds.x, by: b.bounds.y }))
    } else {
      groupSnapshot.current = []
    }
  }, [onClick, block.bounds, block.id])

  const handleResizeStart = useCallback((e: React.MouseEvent, handle: ResizeHandle) => {
    e.stopPropagation()
    e.preventDefault()
    onClick(e)
    setResizing(handle)
    startRef.current = {
      x: e.clientX, y: e.clientY,
      bx: block.bounds.x, by: block.bounds.y,
      bw: block.bounds.w, bh: block.bounds.h,
    }
  }, [onClick, block.bounds])

  useEffect(() => {
    if (!dragging && !resizing) return

    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - startRef.current.x
      const dy = e.clientY - startRef.current.y
      const scale = useStudioStore.getState().canvasZoom / 100
      const sdx = dx / scale
      const sdy = dy / scale

      if (dragging) {
        if (groupSnapshot.current.length > 0) {
          /* Group move: translate all selected blocks by the same offset. */
          const state = useStudioStore.getState()
          if (!state.spec) return
          const updates: Record<string, { bounds: { x: number; y: number; w: number; h: number } }> = {}
          for (const snap of groupSnapshot.current) {
            const orig = state.spec.blocks.find((b) => b.id === snap.id)
            if (!orig) continue
            updates[snap.id] = {
              bounds: {
                x: Math.max(0, Math.round(snap.bx + sdx)),
                y: Math.max(0, Math.round(snap.by + sdy)),
                w: orig.bounds.w,
                h: orig.bounds.h,
              },
            }
          }
          updateBlocks(updates)
        } else {
          const nx = Math.max(0, Math.round(startRef.current.bx + sdx))
          const ny = Math.max(0, Math.round(startRef.current.by + sdy))
          updateBlock(block.id, { bounds: { x: nx, y: ny, w: block.bounds.w, h: block.bounds.h } })
        }
      } else if (resizing) {
        let nx = startRef.current.bx, ny = startRef.current.by
        let nw = startRef.current.bw, nh = startRef.current.bh

        if (resizing.includes('e')) nw = Math.max(MIN_SIZE, startRef.current.bw + sdx)
        if (resizing.includes('s')) nh = Math.max(MIN_SIZE, startRef.current.bh + sdy)
        if (resizing.includes('w')) { nw = Math.max(MIN_SIZE, startRef.current.bw - sdx); nx = startRef.current.bx + (startRef.current.bw - nw) }
        if (resizing.includes('n')) { nh = Math.max(MIN_SIZE, startRef.current.bh - sdy); ny = startRef.current.by + (startRef.current.bh - nh) }

        updateBlock(block.id, { bounds: { x: Math.max(0, Math.round(nx)), y: Math.max(0, Math.round(ny)), w: Math.round(nw), h: Math.round(nh) } })
      }
    }

    const onUp = () => { setDragging(false); setResizing(null) }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [dragging, resizing, block.id, updateBlock])

  const getHandleStyle = (handle: ResizeHandle): React.CSSProperties => {
    const s = HANDLE_SIZE, h2 = s / 2
    const pos: Record<ResizeHandle, React.CSSProperties> = {
      n: { left: '50%', top: -h2, marginLeft: -h2, cursor: 'ns-resize' },
      s: { left: '50%', bottom: -h2, marginLeft: -h2, cursor: 'ns-resize' },
      e: { right: -h2, top: '50%', marginTop: -h2, cursor: 'ew-resize' },
      w: { left: -h2, top: '50%', marginTop: -h2, cursor: 'ew-resize' },
      ne: { right: -h2, top: -h2, cursor: 'nesw-resize' },
      nw: { left: -h2, top: -h2, cursor: 'nwse-resize' },
      se: { right: -h2, bottom: -h2, cursor: 'nwse-resize' },
      sw: { left: -h2, bottom: -h2, cursor: 'nesw-resize' },
    }
    return {
      position: 'absolute', width: s, height: s, borderRadius: 2,
      background: 'var(--accent)', border: '1.5px solid var(--surface)',
      zIndex: 100, ...pos[handle],
    }
  }

  /* When part of a multi-selection, the whole body becomes a drag-handle
     (Canva-style group move). Skip mousedown if it's a resize handle or
     an editable text element. */
  const handleBodyMouseDown = (e: React.MouseEvent) => {
    if (!isMultiSelected) return
    const target = e.target as HTMLElement
    if (target.closest('[data-handle]')) return
    if (target.closest('[contenteditable="true"]')) return
    if (target.closest('[data-text-toolbar]')) return
    handleDragStart(e)
  }

  return (
    <div
      data-block-id={block.id}
      data-block-type={block.type}
      style={{
        position: 'absolute', left: x, top: y, width: w, height: h,
        zIndex: z + 1, borderRadius: 8, userSelect: 'none',
        cursor: isMultiSelected ? 'move' : 'default',
      }}
      className={isSelected || isMultiSelected ? 'ring-2 ring-[var(--accent)]' : ''}
      onClick={onClick}
      onMouseDown={handleBodyMouseDown}
    >
      {(isSelected || isMultiSelected) && (
        <div
          onMouseDown={handleDragStart}
          className="absolute z-20 flex items-center justify-center rounded cursor-grab active:cursor-grabbing"
          style={{
            top: -10, left: -10,
            width: 20, height: 20,
            background: 'var(--accent)',
            opacity: 0.85,
            transition: 'opacity 0.15s',
          }}
          title="Mover bloco"
        >
          <GripVertical size={12} className="text-white" />
        </div>
      )}

      <div className="block-content-wrap w-full h-full overflow-hidden rounded-lg">
        {block.type === 'map' && <StudioMapBlock block={block} isSelected={isSelected} />}
        {block.type === 'card' && <CardBlock block={block} isSelected={isSelected} />}
        {block.type === 'chart' && <ChartBlock block={block} isSelected={isSelected} />}
        {block.type === 'text' && <TextBlock block={block} isSelected={isSelected} />}
        {block.type === 'table' && <TableBlock block={block} isSelected={isSelected} />}
        {block.type === 'image' && <ImageBlock block={block} isSelected={isSelected} />}
        {block.type === 'shape' && <ShapeBlock block={block} isSelected={isSelected} />}
        {block.type === 'timeline' && <TimelineBlock block={block} isSelected={isSelected} />}
        {block.type === 'minimap' && <MinimapBlock block={block} isSelected={isSelected} />}
        {block.type === 'divider' && <DividerBlock block={block} isSelected={isSelected} />}
      </div>

      {isSelected && !isMultiSelected && !isLineShape(block) && (
        <>
          {(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as ResizeHandle[]).map((h) => (
            <div key={h} data-handle={h} style={getHandleStyle(h)} onMouseDown={(e) => handleResizeStart(e, h)} />
          ))}
        </>
      )}
    </div>
  )
}
