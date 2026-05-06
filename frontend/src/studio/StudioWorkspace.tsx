import { useEffect, useState, useRef } from 'react'
import { Sun, Moon, Undo2, Redo2, Grid3X3, Minus, Plus, Copy, ClipboardPaste, Scissors, Save, FolderOpen, FilePlus2, Trash2 } from 'lucide-react'
import { useStudioStore } from './store/studioStore'
import { useAppStore } from '../stores/appStore'
import { t } from '../i18n'
import type { MapBlockConfig, PageSpec } from './types'
import StudioLeftPanel from './StudioLeftPanel'
import StudioRightPanel from './StudioRightPanel'
import InfographicCanvas from './Canvas/InfographicCanvas'
import ExportPanel from './ExportPanel'
import LanguageMenu from '../components/LanguageMenu'
import { toast } from 'sonner'
import { buildPagePreview } from './export/svgExport'

export default function StudioWorkspace() {
  const {
    undo,
    redo,
    history,
    historyIndex,
    canvasZoom,
    setCanvasZoom,
    showGrid,
    setShowGrid,
    showGuides,
    setShowGuides,
    addPage,
    setActivePage,
    renamePage,
    removePage,
    updatePagePreview,
    exportMode,
    selectBlock,
    selectedBlockIds,
    copyBlocks,
    pasteBlocks,
    cutBlocks,
    spec,
    setSpec,
    activeMapId,
  } = useStudioStore()

  const { theme, toggleTheme, language } = useAppStore()
  const activeMap = spec?.blocks.find((b) => b.id === activeMapId)
  const cfg = (activeMap?.config || {}) as MapBlockConfig
  const areaName = cfg.areaName || cfg.name || 'Brasil'
  const loadInputRef = useRef<HTMLInputElement>(null)
  const [editingPageId, setEditingPageId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const pages = ((spec?.metadata?.pages as any[]) || []) as PageSpec[]
  const activePageId = (spec?.metadata?.activePageId as string | undefined) || pages[0]?.id

  const canUndo = historyIndex > 0
  const canRedo = historyIndex < history.length - 1

  useEffect(() => {
    if (!spec || !activePageId) return
    const timeout = window.setTimeout(async () => {
      try {
        const dataUrl = await buildPagePreview(spec, 120, 78)
        updatePagePreview(activePageId, dataUrl)
      } catch {
        // ignore preview failures
      }
    }, 400)
    return () => window.clearTimeout(timeout)
  }, [spec?.blocks, spec?.canvas, activePageId, updatePagePreview])

  const handleSave = () => {
    if (!spec) return
    const data = JSON.stringify(spec, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pymaps-${spec.title || 'project'}-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success(t(language, 'studio.projectSaved'))
  }

  const handleLoad = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(String(ev.target?.result || '{}'))
        if (!json.canvas || !json.blocks) {
          toast.error(t(language, 'studio.invalidFile'))
          return
        }
        setSpec(json)
        toast.success(t(language, 'studio.projectLoaded'))
      } catch {
        toast.error(t(language, 'studio.fileReadError'))
      } finally {
        e.target.value = ''
      }
    }
    reader.readAsText(file)
  }

  useEffect(() => {
    if (exportMode === 'selecting') {
      document.body.classList.add('export-mode')
      selectBlock(null)
    } else if (exportMode === 'capturing') {
      document.body.classList.add('export-capturing')
    } else {
      document.body.classList.remove('export-mode', 'export-capturing')
    }
    return () => {
      document.body.classList.remove('export-mode', 'export-capturing')
    }
  }, [exportMode, selectBlock])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMeta = e.ctrlKey || e.metaKey
      if (!isMeta) return
      const target = e.target as HTMLElement
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable
      if (e.key.toLowerCase() === 'c' && !isTyping) {
        e.preventDefault()
        if (selectedBlockIds.length > 0) copyBlocks(selectedBlockIds)
      } else if (e.key.toLowerCase() === 'v' && !isTyping) {
        e.preventDefault()
        pasteBlocks()
      } else if (e.key.toLowerCase() === 'x' && !isTyping) {
        e.preventDefault()
        if (selectedBlockIds.length > 0) cutBlocks(selectedBlockIds)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [selectedBlockIds, copyBlocks, pasteBlocks, cutBlocks])

  return (
    <div className="flex flex-col w-full h-full">
      {/* ── Top Bar ── */}
      <header
        className="flex items-center justify-between flex-none z-20 select-none hide-on-export"
        style={{
          height: 48,
          padding: '0 16px',
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {/* Left — brand + active area */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            <div style={{
              width: 30, height: 30, borderRadius: 8,
              background: 'var(--accent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                <circle cx="12" cy="10" r="3"/>
              </svg>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[13px] font-semibold" style={{ color: 'var(--text)', letterSpacing: '-0.02em' }}>
                PyMaps
              </span>
              <span className="text-[11px] font-medium" style={{ color: 'var(--text-subtle)' }}>
                Studio
              </span>
            </div>
          </div>

          <div className="h-5 w-px" style={{ background: 'var(--border)' }} />

          <div className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px]"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
            <span className="inline-block h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--success)' }} />
            <span className="font-medium" style={{ color: 'var(--text)' }}>{areaName}</span>
          </div>
        </div>

        {/* Center — toolbar */}
        <div className="flex items-center gap-1">
          <ToolbarButton onClick={undo} disabled={!canUndo} title={t(language, 'studio.undo')}>
            <Undo2 size={14} />
          </ToolbarButton>
          <ToolbarButton onClick={redo} disabled={!canRedo} title={t(language, 'studio.redo')}>
            <Redo2 size={14} />
          </ToolbarButton>

          <Separator />

          <ToolbarButton onClick={() => setCanvasZoom(Math.max(25, canvasZoom - 25))} title={t(language, 'studio.zoomOut')}>
            <Minus size={14} />
          </ToolbarButton>
          <span className="text-[11px] tabular-nums font-medium min-w-[38px] text-center" style={{ color: 'var(--text-muted)' }}>
            {canvasZoom}%
          </span>
          <ToolbarButton onClick={() => setCanvasZoom(Math.min(300, canvasZoom + 25))} title={t(language, 'studio.zoomIn')}>
            <Plus size={14} />
          </ToolbarButton>

          <Separator />

          <ToolbarButton onClick={() => { if (selectedBlockIds.length > 0) copyBlocks(selectedBlockIds) }} disabled={selectedBlockIds.length === 0} title={t(language, 'studio.copy')}>
            <Copy size={14} />
          </ToolbarButton>
          <ToolbarButton onClick={pasteBlocks} title={t(language, 'studio.paste')}>
            <ClipboardPaste size={14} />
          </ToolbarButton>
          <ToolbarButton onClick={() => { if (selectedBlockIds.length > 0) cutBlocks(selectedBlockIds) }} disabled={selectedBlockIds.length === 0} title={t(language, 'studio.cut')}>
            <Scissors size={14} />
          </ToolbarButton>

          <Separator />

          <ToolbarButton onClick={() => setShowGrid(!showGrid)} active={showGrid} title={t(language, 'studio.grid')}>
            <Grid3X3 size={14} />
          </ToolbarButton>
          <ToolbarButton onClick={() => setShowGuides(!showGuides)} active={showGuides} title={t(language, 'studio.guides')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h16" />
              <path d="M6 4v16" />
              <rect x="8" y="8" width="8" height="8" rx="2" opacity="0.4" />
            </svg>
          </ToolbarButton>

          <Separator />

          <Separator />

          <ToolbarButton onClick={handleSave} title={t(language, 'studio.saveJson')}>
            <Save size={14} />
          </ToolbarButton>
          <ToolbarButton onClick={() => loadInputRef.current?.click()} title={t(language, 'studio.loadJson')}>
            <FolderOpen size={14} />
          </ToolbarButton>
          <input ref={loadInputRef} type="file" accept=".json,.pymaps" className="hidden" onChange={handleLoad} />
        </div>

        {/* Right — user, export, theme */}
        <div className="flex items-center gap-2">
          <LanguageMenu />

          <Separator />

          <ExportPanel />

          <Separator />

          <ToolbarButton onClick={toggleTheme} title={theme === 'dark' ? t(language, 'studio.lightMode') : t(language, 'studio.darkMode')}>
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </ToolbarButton>
        </div>
      </header>

      {/* ── Main Workspace ── */}
      <div className="flex flex-1 overflow-hidden relative">
        <StudioLeftPanel />
        <div className="flex-1 flex flex-col overflow-hidden">
          <InfographicCanvas />

          {/* Pages strip */}
          <div
            className="hide-on-export"
            style={{
              height: 120,
              background: 'var(--surface)',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '10px 12px',
            }}
          >
            <div className="flex flex-col items-center gap-2" style={{ minWidth: 110 }}>
              <button
                onClick={() => addPage()}
                disabled={pages.length >= 50}
                className="flex flex-col items-center justify-center gap-1.5 rounded-md border text-[10px] font-semibold"
                style={{
                  width: 120,
                  height: 78,
                  borderStyle: 'dashed',
                  borderColor: pages.length >= 50 ? 'var(--border)' : 'var(--accent)',
                  color: pages.length >= 50 ? 'var(--text-subtle)' : 'var(--accent)',
                  background: pages.length >= 50 ? 'var(--surface-strong)' : 'var(--accent-soft)',
                  cursor: pages.length >= 50 ? 'not-allowed' : 'pointer',
                  lineHeight: 1.1,
                }}
              >
                <FilePlus2 size={16} />
                {t(language, 'studio.addPage')}
              </button>
              <div style={{ height: 14, fontSize: 10, color: 'transparent' }}>.</div>
            </div>

            <div className="flex-1 overflow-x-auto custom-scrollbar">
              <div className="flex items-center gap-10" style={{ padding: '0 4px' }}>
                {pages.map((p, index) => {
                  const isActive = p.id === activePageId
                  return (
                    <div key={p.id} className="flex flex-col items-center gap-2" style={{ minWidth: 110 }}>
                      <div
                        className="relative"
                        style={{ width: 120, height: 78 }}
                      >
                        <button
                        onClick={() => setActivePage(p.id)}
                        className="relative rounded-md border"
                        style={{
                          width: 120,
                          height: 78,
                          background: 'var(--surface-muted)',
                          borderColor: isActive ? 'var(--accent)' : 'var(--border)',
                          boxShadow: isActive ? '0 0 0 2px var(--accent-soft)' : 'none',
                          overflow: 'hidden',
                        }}
                        title={p.name}
                      >
                        <PageThumbnail page={p} fallbackCanvas={spec?.canvas} />
                        <div style={{
                          position: 'absolute', left: 6, top: 6,
                          fontSize: 9, color: 'var(--text-subtle)',
                        }}>
                          {index + 1}
                        </div>
                        <div style={{
                          position: 'absolute', right: 6, bottom: 6,
                          fontSize: 9, color: 'var(--text-subtle)',
                        }}>
                          {p.canvas?.width || spec?.canvas.width}×{p.canvas?.height || spec?.canvas.height}
                        </div>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); removePage(p.id) }}
                          disabled={pages.length <= 1}
                          title={t(language, 'studio.deletePage')}
                          style={{
                            position: 'absolute', top: -6, right: -6,
                            width: 20, height: 20,
                            borderRadius: 10,
                            background: 'var(--surface)',
                            color: pages.length <= 1 ? 'var(--text-subtle)' : 'var(--text-muted)',
                            border: '1px solid var(--border)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: pages.length <= 1 ? 'not-allowed' : 'pointer',
                            opacity: pages.length <= 1 ? 0.6 : 1,
                          }}
                          onMouseEnter={(e) => {
                            if (pages.length <= 1) return
                            e.currentTarget.style.background = 'var(--surface-muted)'
                            e.currentTarget.style.color = 'var(--text)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'var(--surface)'
                            e.currentTarget.style.color = pages.length <= 1 ? 'var(--text-subtle)' : 'var(--text-muted)'
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                      {editingPageId === p.id ? (
                        <input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onBlur={() => { if (editingName.trim()) renamePage(p.id, editingName.trim()); setEditingPageId(null) }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur()
                            if (e.key === 'Escape') setEditingPageId(null)
                          }}
                          className="text-[10px] rounded px-2 py-1"
                          style={{ background: 'var(--surface-strong)', color: 'var(--text)', border: '1px solid var(--border)', width: 120 }}
                          autoFocus
                        />
                      ) : (
                        <button
                          onClick={() => setActivePage(p.id)}
                          onDoubleClick={() => { setEditingPageId(p.id); setEditingName(p.name) }}
                          className="text-[10px] font-medium"
                          style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)', maxWidth: 120 }}
                        >
                          {p.name}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
        <StudioRightPanel />
      </div>

    </div>
  )
}

function Separator() {
  return <div className="h-5 w-px mx-0.5 flex-shrink-0" style={{ background: 'var(--border)' }} />
}

function ToolbarButton({
  children,
  onClick,
  disabled,
  active,
  title,
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  active?: boolean
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: 30,
        height: 30,
        borderRadius: 7,
        background: active ? 'var(--accent-soft)' : 'transparent',
        color: disabled ? 'var(--text-subtle)' : active ? 'var(--accent)' : 'var(--text-muted)',
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        border: 'none',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'background 0.1s, color 0.1s',
      }}
      onMouseEnter={(e) => {
        if (!disabled && !active) e.currentTarget.style.background = 'var(--surface-muted)'
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent'
      }}
    >
      {children}
    </button>
  )
}

function PageThumbnail({ page, fallbackCanvas }: { page: PageSpec; fallbackCanvas?: { width: number; height: number; background: string } }) {
  const canvas = page.canvas || fallbackCanvas
  const preview = page.preview
  if (preview) {
    return (
      <img
        src={preview}
        alt={page.name}
        style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
      />
    )
  }
  return (
    <div style={{ width: '100%', height: '100%', background: canvas?.background || 'var(--surface)' }} />
  )
}
