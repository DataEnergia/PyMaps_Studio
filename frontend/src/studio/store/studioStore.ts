import { create } from 'zustand'
import type { InfographicSpec, Block, CanvasSpec, MapBlockConfig, PageSpec } from '../types'

export interface ExportSelection {
  x: number
  y: number
  w: number
  h: number
}

interface StudioState {
  spec: InfographicSpec | null
  selectedBlockId: string | null
  selectedBlockIds: string[]
  editingBlockId: string | null
  /** ID of the map block currently driving the left-panel Area/Data/Style tabs. */
  activeMapId: string | null
  /** Active page ID for multi-page projects. */
  activePageId: string | null
  history: InfographicSpec[]
  historyIndex: number
  canvasZoom: number
  showGrid: boolean
  showGuides: boolean
  exportFormat: 'png' | 'jpg' | 'svg' | 'pdf'
  exportQuality: 1 | 2 | 3
  exportMode: 'idle' | 'selecting' | 'capturing'
  exportSelection: ExportSelection | null
  /** Blocks copied to clipboard (deep-cloned). */
  clipboardBlocks: Block[]
  /** How many consecutive pastes since last copy (for progressive offset). */
  pasteCount: number

  setSpec: (spec: InfographicSpec | null) => void
  updateBlock: (blockId: string, updates: Partial<Block>) => void
  updateBlocks: (updates: Record<string, Partial<Block>>) => void
  /** Patch the .config of a block (deep merge first level). */
  patchBlockConfig: (blockId: string, patch: Record<string, unknown>) => void
  addBlock: (block: Block) => void
  removeBlock: (blockId: string) => void
  selectBlock: (id: string | null, additive?: boolean) => void
  toggleBlockSelection: (id: string) => void
  selectAllBlocks: () => void
  clearSelection: () => void
  setEditingBlock: (id: string | null) => void
  setActiveMapId: (id: string | null) => void
  setActivePage: (id: string) => void
  addPage: () => void
  renamePage: (id: string, name: string) => void
  removePage: (id: string) => void
  setCanvasSize: (size: Partial<CanvasSpec>) => void
  setCanvasZoom: (zoom: number) => void
  setShowGrid: (show: boolean) => void
  setShowGuides: (show: boolean) => void
  /** Patch spec.metadata (shallow merge). */
  updateSpecMetadata: (patch: Record<string, unknown>) => void
  updatePagePreview: (pageId: string, preview: string) => void
  setExportFormat: (f: 'png' | 'jpg' | 'svg' | 'pdf') => void
  setExportQuality: (q: 1 | 2 | 3) => void
  setExportMode: (mode: 'idle' | 'selecting' | 'capturing') => void
  setExportSelection: (sel: ExportSelection | null) => void
  undo: () => void
  redo: () => void
  pushHistory: () => void
  resetCanvas: () => void
  /** Copy selected block IDs to internal clipboard. */
  copyBlocks: (ids: string[]) => void
  /** Paste clipboard blocks as new blocks with offset. */
  pasteBlocks: () => void
  /** Cut selected block IDs (copy then remove). */
  cutBlocks: (ids: string[]) => void
}

const DEFAULT_MAP_CONFIG: MapBlockConfig = {
  name: 'Mapa 1',
  area: { type: 'brasil' },
  basemap: 'none',
  fillColor: '#2d3742',
  borderColor: '#7a8a9a',
  borderWidth: 1,
  fillOpacity: 0.85,
  markerColor: '#d9822b',
  markerSize: 3,
  markerStrokeWidth: 0.8,
  markerStrokeColor: '#ffffff',

  featureColors: {},
  showStateLabels: true,
  stateLabelColor: '#ffffff',
  stateLabelSize: 12,
}

const DEFAULT_SPEC: InfographicSpec = {
  canvas: { width: 1200, height: 800, background: 'var(--surface)' },
  blocks: [
    {
      id: 'map-brasil',
      type: 'map',
      bounds: { x: 20, y: 20, w: 740, h: 520 },
      config: { ...DEFAULT_MAP_CONFIG },
      zIndex: 0,
      locked: false,
    },
  ],
  title: 'Brasil',
  description: 'Mapa do Brasil',
  metadata: {},
}

function ensurePages(spec: InfographicSpec): { spec: InfographicSpec; activePageId: string } {
  const meta = spec.metadata || {}
  const rawPages = (meta.pages as PageSpec[] | undefined) || []
  const pages = rawPages.length > 0
    ? rawPages
    : [{ id: 'page-1', name: 'Página 1', canvas: spec.canvas, blocks: spec.blocks }]
  const activePageId = (meta.activePageId as string | undefined)
    || pages[0]?.id
    || 'page-1'
  const nextSpec: InfographicSpec = {
    ...spec,
    metadata: { ...meta, pages, activePageId },
  }
  return { spec: nextSpec, activePageId }
}

function syncActivePage(spec: InfographicSpec, activePageId: string | null): InfographicSpec {
  if (!activePageId) return spec
  const meta = spec.metadata || {}
  const pages = Array.isArray(meta.pages) ? [...(meta.pages as PageSpec[])] : []
  const idx = pages.findIndex((p) => p.id === activePageId)
  if (idx === -1) return spec
  pages[idx] = { ...pages[idx], canvas: spec.canvas, blocks: spec.blocks }
  return { ...spec, metadata: { ...meta, pages, activePageId } }
}

function getActiveMapIdForSpec(spec: InfographicSpec | null): string | null {
  if (!spec) return null
  return spec.blocks.find((b) => b.type === 'map')?.id ?? null
}

const ensured = ensurePages(DEFAULT_SPEC)

export const useStudioStore = create<StudioState>((set, get) => ({
  spec: ensured.spec,
  selectedBlockId: null,
  selectedBlockIds: [],
  editingBlockId: null,
  activeMapId: getActiveMapIdForSpec(ensured.spec),
  activePageId: ensured.activePageId,
  history: [ensured.spec],
  historyIndex: 0,
  canvasZoom: 100,
  showGrid: true,
  showGuides: true,
  exportFormat: 'png',
  exportQuality: 2,
  exportMode: 'idle',
  exportSelection: null,
  clipboardBlocks: [],
  pasteCount: 0,

  setSpec: (spec) => {
    if (spec) {
      const ensuredSpec = ensurePages(spec)
      const nextActiveMapId = getActiveMapIdForSpec(ensuredSpec.spec)
      set((s) => {
        const newHistory = s.history.slice(0, s.historyIndex + 1)
        newHistory.push(ensuredSpec.spec)
        return {
          spec: ensuredSpec.spec,
          history: newHistory,
          historyIndex: newHistory.length - 1,
          activePageId: ensuredSpec.activePageId,
          activeMapId: nextActiveMapId,
          selectedBlockId: null,
          selectedBlockIds: [],
        }
      })
    } else {
      set({ spec: null, history: [], historyIndex: -1 })
    }
  },

  updateBlock: (blockId, updates) =>
    set((s) => {
      if (!s.spec) return {}
      const blocks = s.spec.blocks.map((b) => (b.id === blockId ? { ...b, ...updates } : b))
      const nextSpec = syncActivePage({ ...s.spec, blocks }, s.activePageId)
      return { spec: nextSpec }
    }),

  updateBlocks: (updates) =>
    set((s) => {
      if (!s.spec) return {}
      const blocks = s.spec.blocks.map((b) =>
        updates[b.id] ? { ...b, ...updates[b.id] } : b
      )
      const nextSpec = syncActivePage({ ...s.spec, blocks }, s.activePageId)
      return { spec: nextSpec }
    }),

  patchBlockConfig: (blockId, patch) =>
    set((s) => {
      if (!s.spec) return {}
      const blocks = s.spec.blocks.map((b) =>
        b.id === blockId
          ? { ...b, config: { ...(b.config as Record<string, unknown>), ...patch } }
          : b
      )
      const nextSpec = syncActivePage({ ...s.spec, blocks }, s.activePageId)
      return { spec: nextSpec }
    }),

  addBlock: (block) =>
    set((s) => {
      if (!s.spec) return {}
      const next = syncActivePage({ ...s.spec, blocks: [...s.spec.blocks, block] }, s.activePageId)
      const newHistory = s.history.slice(0, s.historyIndex + 1)
      newHistory.push(next)
      return { spec: next, history: newHistory, historyIndex: newHistory.length - 1 }
    }),

  removeBlock: (blockId) =>
    set((s) => {
      if (!s.spec) return {}
      const next = syncActivePage({ ...s.spec, blocks: s.spec.blocks.filter((b) => b.id !== blockId) }, s.activePageId)
      // Clear active map if we deleted it
      const newActive = s.activeMapId === blockId
        ? (next.blocks.find((b) => b.type === 'map')?.id ?? null)
        : s.activeMapId
      return {
        spec: next,
        selectedBlockId: s.selectedBlockId === blockId ? null : s.selectedBlockId,
        selectedBlockIds: s.selectedBlockIds.filter((id) => id !== blockId),
        activeMapId: newActive,
      }
    }),

  selectBlock: (id, additive = false) =>
    set((s) => {
      const next: Partial<StudioState> = (() => {
        if (!additive || id === null) {
          return { selectedBlockId: id, selectedBlockIds: id ? [id] : [] }
        }
        const arr = s.selectedBlockIds.includes(id)
          ? s.selectedBlockIds
          : [...s.selectedBlockIds, id]
        return { selectedBlockId: id, selectedBlockIds: arr }
      })()
      // Auto-promote: when selecting a map block, make it active
      if (id) {
        const block = s.spec?.blocks.find((b) => b.id === id)
        if (block?.type === 'map') {
          next.activeMapId = id
        }
      }
      return next
    }),

  toggleBlockSelection: (id) =>
    set((s) => {
      const has = s.selectedBlockIds.includes(id)
      const arr = has ? s.selectedBlockIds.filter((x) => x !== id) : [...s.selectedBlockIds, id]
      const block = s.spec?.blocks.find((b) => b.id === id)
      const next: Partial<StudioState> = {
        selectedBlockIds: arr,
        selectedBlockId: arr.length > 0 ? arr[arr.length - 1] : null,
      }
      if (block?.type === 'map' && !has) next.activeMapId = id
      return next
    }),

  selectAllBlocks: () =>
    set((s) => {
      if (!s.spec) return {}
      const all = s.spec.blocks.map((b) => b.id)
      return { selectedBlockIds: all, selectedBlockId: all[all.length - 1] || null }
    }),

  clearSelection: () => set({ selectedBlockId: null, selectedBlockIds: [] }),

  setEditingBlock: (id) => set({ editingBlockId: id }),

  setActiveMapId: (id) =>
    set(() => {
      // Selecting a map from the sidebar also selects it on canvas
      return { activeMapId: id, selectedBlockId: id, selectedBlockIds: id ? [id] : [] }
    }),

  setActivePage: (id) =>
    set((s) => {
      if (!s.spec) return {}
      const meta = s.spec.metadata || {}
      const pages = Array.isArray(meta.pages) ? [...(meta.pages as PageSpec[])] : []
      if (pages.length === 0) return {}
      const currentId = s.activePageId || meta.activePageId
      const currentIdx = pages.findIndex((p) => p.id === currentId)
      if (currentIdx >= 0) {
        pages[currentIdx] = { ...pages[currentIdx], canvas: s.spec.canvas, blocks: s.spec.blocks }
      }
      const target = pages.find((p) => p.id === id)
      if (!target) return {}
      const nextSpec: InfographicSpec = {
        ...s.spec,
        canvas: target.canvas,
        blocks: target.blocks,
        metadata: { ...meta, pages, activePageId: id },
      }
      return {
        spec: nextSpec,
        activePageId: id,
        activeMapId: getActiveMapIdForSpec(nextSpec),
        selectedBlockId: null,
        selectedBlockIds: [],
      }
    }),

  addPage: () =>
    set((s) => {
      if (!s.spec) return {}
      const meta = s.spec.metadata || {}
      const pages = Array.isArray(meta.pages) ? [...(meta.pages as PageSpec[])] : []
      if (pages.length >= 50) return {}
      const currentId = s.activePageId || meta.activePageId
      const currentIdx = pages.findIndex((p) => p.id === currentId)
      if (currentIdx >= 0) {
        pages[currentIdx] = { ...pages[currentIdx], canvas: s.spec.canvas, blocks: s.spec.blocks }
      }
      const nextId = `page-${Date.now()}`
      const name = `Página ${pages.length + 1}`
      const newPage: PageSpec = {
        id: nextId,
        name,
        canvas: s.spec.canvas,
        blocks: [],
      }
      const nextPages = [...pages, newPage]
      const nextSpec: InfographicSpec = {
        ...s.spec,
        canvas: newPage.canvas,
        blocks: newPage.blocks,
        metadata: { ...meta, pages: nextPages, activePageId: nextId },
      }
      const newHistory = s.history.slice(0, s.historyIndex + 1)
      newHistory.push(nextSpec)
      return {
        spec: nextSpec,
        history: newHistory,
        historyIndex: newHistory.length - 1,
        activePageId: nextId,
        activeMapId: getActiveMapIdForSpec(nextSpec),
        selectedBlockId: null,
        selectedBlockIds: [],
      }
    }),

  renamePage: (id, name) =>
    set((s) => {
      if (!s.spec) return {}
      const meta = s.spec.metadata || {}
      const pages = Array.isArray(meta.pages) ? [...(meta.pages as PageSpec[])] : []
      const idx = pages.findIndex((p) => p.id === id)
      if (idx < 0) return {}
      pages[idx] = { ...pages[idx], name }
      return { spec: { ...s.spec, metadata: { ...meta, pages } } }
    }),

  removePage: (id) =>
    set((s) => {
      if (!s.spec) return {}
      const meta = s.spec.metadata || {}
      const pages = Array.isArray(meta.pages) ? [...(meta.pages as PageSpec[])] : []
      if (pages.length <= 1) return {}
      const idx = pages.findIndex((p) => p.id === id)
      if (idx < 0) return {}
      const nextPages = pages.filter((p) => p.id !== id)
      const nextActiveId = (s.activePageId === id)
        ? (nextPages[Math.max(0, idx - 1)]?.id || nextPages[0].id)
        : s.activePageId
      const nextActive = nextPages.find((p) => p.id === nextActiveId) || nextPages[0]
      const nextSpec: InfographicSpec = {
        ...s.spec,
        canvas: nextActive.canvas,
        blocks: nextActive.blocks,
        metadata: { ...meta, pages: nextPages, activePageId: nextActive.id },
      }
      const newHistory = s.history.slice(0, s.historyIndex + 1)
      newHistory.push(nextSpec)
      return {
        spec: nextSpec,
        history: newHistory,
        historyIndex: newHistory.length - 1,
        activePageId: nextActive.id,
        activeMapId: getActiveMapIdForSpec(nextSpec),
        selectedBlockId: null,
        selectedBlockIds: [],
      }
    }),

  setCanvasSize: (size) =>
    set((s) => {
      if (!s.spec) return {}
      const nextSpec = syncActivePage({ ...s.spec, canvas: { ...s.spec.canvas, ...size } }, s.activePageId)
      return { spec: nextSpec }
    }),

  setCanvasZoom: (zoom) => set({ canvasZoom: zoom }),

  setShowGrid: (show) => set({ showGrid: show }),

  setShowGuides: (show) => set({ showGuides: show }),

  updateSpecMetadata: (patch) =>
    set((s) => {
      if (!s.spec) return {}
      const metadata = { ...(s.spec.metadata || {}), ...patch }
      const nextSpec = syncActivePage({ ...s.spec, metadata }, s.activePageId)
      return { spec: nextSpec }
    }),

  updatePagePreview: (pageId, preview) =>
    set((s) => {
      if (!s.spec) return {}
      const meta = s.spec.metadata || {}
      const pages = Array.isArray(meta.pages) ? [...(meta.pages as PageSpec[])] : []
      const idx = pages.findIndex((p) => p.id === pageId)
      if (idx < 0) return {}
      pages[idx] = { ...pages[idx], preview }
      return { spec: { ...s.spec, metadata: { ...meta, pages } } }
    }),

  setExportFormat: (f) => set({ exportFormat: f }),

  setExportQuality: (q) => set({ exportQuality: q }),

  setExportMode: (mode) => set({ exportMode: mode }),

  setExportSelection: (sel) => set({ exportSelection: sel }),

  undo: () => {
    const { historyIndex, history } = get()
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1
      const ensuredSpec = ensurePages(history[newIndex])
      set({
        spec: ensuredSpec.spec,
        historyIndex: newIndex,
        activePageId: ensuredSpec.activePageId,
        activeMapId: getActiveMapIdForSpec(ensuredSpec.spec),
        selectedBlockId: null,
        selectedBlockIds: [],
      })
    }
  },

  redo: () => {
    const { historyIndex, history } = get()
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1
      const ensuredSpec = ensurePages(history[newIndex])
      set({
        spec: ensuredSpec.spec,
        historyIndex: newIndex,
        activePageId: ensuredSpec.activePageId,
        activeMapId: getActiveMapIdForSpec(ensuredSpec.spec),
        selectedBlockId: null,
        selectedBlockIds: [],
      })
    }
  },

  pushHistory: () => {
    const { spec } = get()
    if (!spec) return
    set((s) => {
      const nextSpec = syncActivePage(s.spec!, s.activePageId)
      const newHistory = s.history.slice(0, s.historyIndex + 1)
      newHistory.push(nextSpec)
      return { spec: nextSpec, history: newHistory, historyIndex: newHistory.length - 1 }
    })
  },

  resetCanvas: () => {
    const base = JSON.parse(JSON.stringify(DEFAULT_SPEC)) as InfographicSpec
    set((s) => {
      if (!s.spec) return {}
      const meta = s.spec.metadata || {}
      const pages = Array.isArray(meta.pages) ? [...(meta.pages as PageSpec[])] : []
      if (pages.length === 0) {
        const ensured = ensurePages(base)
        const newHistory = s.history.slice(0, s.historyIndex + 1)
        newHistory.push(ensured.spec)
        return {
          spec: ensured.spec,
          history: newHistory,
          historyIndex: newHistory.length - 1,
          activeMapId: getActiveMapIdForSpec(ensured.spec),
          activePageId: ensured.activePageId,
          selectedBlockId: null,
          selectedBlockIds: [],
        }
      }

      const metaActivePageId = typeof meta.activePageId === 'string' ? meta.activePageId : undefined
      const currentId = s.activePageId || metaActivePageId || pages[0].id
      const idx = pages.findIndex((p) => p.id === currentId)
      if (idx >= 0) {
        pages[idx] = { ...pages[idx], canvas: base.canvas, blocks: base.blocks }
      }
      const nextSpec: InfographicSpec = {
        ...s.spec,
        canvas: base.canvas,
        blocks: base.blocks,
        metadata: { ...meta, pages, activePageId: currentId },
      }
      const newHistory = s.history.slice(0, s.historyIndex + 1)
      newHistory.push(nextSpec)
      return {
        spec: nextSpec,
        history: newHistory,
        historyIndex: newHistory.length - 1,
        activeMapId: getActiveMapIdForSpec(nextSpec),
        activePageId: currentId,
        selectedBlockId: null,
        selectedBlockIds: [],
      }
    })
  },

  copyBlocks: (ids) => {
    const { spec } = get()
    if (!spec || ids.length === 0) return
    const toCopy = spec.blocks.filter((b) => ids.includes(b.id))
    if (toCopy.length === 0) return
    set({
      clipboardBlocks: JSON.parse(JSON.stringify(toCopy)) as Block[],
      pasteCount: 0,
    })
  },

  cutBlocks: (ids) => {
    const { spec } = get()
    if (!spec || ids.length === 0) return
    const toCopy = spec.blocks.filter((b) => ids.includes(b.id))
    if (toCopy.length === 0) return
    const nextBlocks = spec.blocks.filter((b) => !ids.includes(b.id))
    const nextSpec = { ...spec, blocks: nextBlocks }
    set((s) => {
      const newHistory = s.history.slice(0, s.historyIndex + 1)
      newHistory.push(nextSpec)
      return {
        spec: nextSpec,
        history: newHistory,
        historyIndex: newHistory.length - 1,
        clipboardBlocks: JSON.parse(JSON.stringify(toCopy)) as Block[],
        pasteCount: 0,
        selectedBlockId: null,
        selectedBlockIds: [],
      }
    })
  },

  pasteBlocks: () => {
    const { spec, clipboardBlocks, pasteCount } = get()
    if (!spec || clipboardBlocks.length === 0) return

    const offset = 20 * (pasteCount + 1)
    const idMap = new Map<string, string>()
    const newBlocks: Block[] = []

    for (const b of clipboardBlocks) {
      const newId = `${b.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      idMap.set(b.id, newId)
      newBlocks.push({
        ...b,
        id: newId,
        bounds: {
          x: b.bounds.x + offset,
          y: b.bounds.y + offset,
          w: b.bounds.w,
          h: b.bounds.h,
        },
        zIndex: spec.blocks.length + newBlocks.length,
      })
    }

    // Fix connector references inside pasted blocks
    for (const nb of newBlocks) {
      if (nb.type === 'connector') {
        const cfg = nb.config as Record<string, unknown>
        const fromAnchor = cfg.fromAnchor as Record<string, unknown> | undefined
        const toAnchor = cfg.toAnchor as Record<string, unknown> | undefined
        if (fromAnchor?.blockId && idMap.has(fromAnchor.blockId as string)) {
          ;(nb.config as Record<string, unknown>).fromAnchor = {
            ...fromAnchor,
            blockId: idMap.get(fromAnchor.blockId as string),
          }
        }
        if (toAnchor?.blockId && idMap.has(toAnchor.blockId as string)) {
          ;(nb.config as Record<string, unknown>).toAnchor = {
            ...toAnchor,
            blockId: idMap.get(toAnchor.blockId as string),
          }
        }
      }
    }

    const nextSpec = { ...spec, blocks: [...spec.blocks, ...newBlocks] }
    set((s) => {
      const newHistory = s.history.slice(0, s.historyIndex + 1)
      newHistory.push(nextSpec)
      return {
        spec: nextSpec,
        history: newHistory,
        historyIndex: newHistory.length - 1,
        pasteCount: s.pasteCount + 1,
        selectedBlockId: newBlocks[newBlocks.length - 1]?.id ?? null,
        selectedBlockIds: newBlocks.map((b) => b.id),
      }
    })
  },
}))

/* ── Helpers exposed to components/exporters ───────────────────────── */

export const DEFAULT_MAP_BLOCK_CONFIG = DEFAULT_MAP_CONFIG

export function getMapBlocks(spec: InfographicSpec | null): Block[] {
  if (!spec) return []
  return spec.blocks.filter((b) => b.type === 'map')
}

export function getActiveMapBlock(state: StudioState): Block | null {
  const id = state.activeMapId
  if (!id || !state.spec) return null
  return state.spec.blocks.find((b) => b.id === id && b.type === 'map') || null
}
