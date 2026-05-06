import { useState, useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { RotateCcw, Globe, Layers, Eye, Plus, Copy, Trash2, ChevronLeft } from 'lucide-react'
import { useAppStore } from '../stores/appStore'
import { useStudioStore, DEFAULT_MAP_BLOCK_CONFIG } from './store/studioStore'
import MapTab from '../components/layers/MapTab'
import LayersTab from '../components/layers/LayersTab'
import VisualTab from '../components/layers/VisualTab'
import { t } from '../i18n'
import type { Block, MapBlockConfig } from './types'

export default function StudioLeftPanel() {
  const [activeTab, setActiveTab] = useState<'map' | 'layers' | 'visual'>('map')
  const { panelOpen, setPanelOpen, language } = useAppStore()
  const { spec, activeMapId, setActiveMapId, addBlock, removeBlock, resetCanvas } = useStudioStore()
  const tabs = [
    { id: 'map' as const, label: t(language, 'left.map'), icon: Globe },
    { id: 'layers' as const, label: t(language, 'left.layers'), icon: Layers },
    { id: 'visual' as const, label: t(language, 'left.visual'), icon: Eye },
  ]

  const mapBlocks = useMemo(
    () => (spec?.blocks || []).filter((b) => b.type === 'map'),
    [spec]
  )

  const addNewMap = () => {
    if (!spec) return
    const id = `map-${Date.now()}`
    const existing = spec.blocks
    const rightmost = existing.length > 0 ? Math.max(...existing.map((b) => b.bounds.x + b.bounds.w)) : 0
    const x = rightmost >= spec.canvas.width - 200 ? 20 : rightmost + 20
    const y = 20
    const idx = mapBlocks.length + 1
    const newBlock: Block = {
      id, type: 'map',
      bounds: { x, y, w: 480, h: 360 },
      config: { ...DEFAULT_MAP_BLOCK_CONFIG, name: t(language, 'map.defaultName', { count: idx }) },
      zIndex: existing.length,
    }
    addBlock(newBlock)
    setActiveMapId(id)
  }

  const duplicateMap = () => {
    if (!spec || !activeMapId) return
    const src = spec.blocks.find((b) => b.id === activeMapId)
    if (!src) return
    const id = `map-${Date.now()}`
    const idx = mapBlocks.length + 1
    const cfg = { ...(src.config as MapBlockConfig), name: t(language, 'map.defaultName', { count: idx }) }
    const newBlock: Block = {
      id, type: 'map',
      bounds: { x: src.bounds.x + 20, y: src.bounds.y + 20, w: src.bounds.w, h: src.bounds.h },
      config: {
        ...cfg,
        featureColors: { ...(cfg.featureColors || {}) },
        markers: [...(cfg.markers || [])],
      },
      zIndex: spec.blocks.length,
    }
    addBlock(newBlock)
    setActiveMapId(id)
  }

  const removeActiveMap = () => {
    if (!activeMapId) return
    if (mapBlocks.length <= 1) return
    removeBlock(activeMapId)
  }

  return (
    <>
      {/* Panel toggle */}
      <button
        onClick={() => setPanelOpen(!panelOpen)}
        className="hidden lg:flex absolute z-30 items-center justify-center"
        style={{
          left: panelOpen ? 320 : 0,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 16,
          height: 48,
          borderRadius: '0 6px 6px 0',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderLeft: panelOpen ? '1px solid var(--border)' : 'none',
          color: 'var(--text-subtle)',
          transition: 'left 0.18s ease, color 0.12s',
          cursor: 'pointer',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text)' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-subtle)' }}
      >
        <ChevronLeft
          size={12}
          style={{ transform: panelOpen ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.2s' }}
        />
      </button>

      <AnimatePresence>
        {panelOpen && (
          <motion.aside
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -20, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="flex flex-col h-full flex-none"
            style={{ width: 320, background: 'var(--surface)', borderRight: '1px solid var(--border)' }}
          >
            {/* Map Selector */}
            {mapBlocks.length > 0 && (
              <div className="flex-none px-3 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-subtle)', letterSpacing: '0.06em' }}>
                    {t(language, 'left.maps')}
                  </span>
                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: 'var(--surface-muted)', color: 'var(--text-subtle)' }}>
                    {mapBlocks.length}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2.5">
                  {mapBlocks.map((b) => {
                    const cfg = (b.config || {}) as MapBlockConfig
                    const active = activeMapId === b.id
                    return (
                      <button key={b.id}
                        onClick={() => setActiveMapId(b.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium max-w-[140px]"
                        style={{
                          background: active ? 'var(--accent)' : 'var(--surface-muted)',
                          color: active ? '#ffffff' : 'var(--text-muted)',
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'background 0.12s, color 0.12s',
                        }}
                        onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--border)' }}
                        onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'var(--surface-muted)' }}
                        title={cfg.areaName || cfg.name || b.id}
                      >
                        <span className="truncate">{cfg.name || t(language, 'left.map')}</span>
                      </button>
                    )
                  })}
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { label: t(language, 'left.new'), icon: Plus, action: addNewMap, disabled: false },
                    { label: t(language, 'left.duplicate'), icon: Copy, action: duplicateMap, disabled: !activeMapId },
                    { label: t(language, 'left.remove'), icon: Trash2, action: removeActiveMap, disabled: !activeMapId || mapBlocks.length <= 1 },
                  ].map(({ label, icon: Icon, action, disabled }) => (
                    <button key={label}
                      onClick={action}
                      disabled={disabled}
                      className="inline-flex items-center justify-center gap-1 rounded-lg py-1.5 text-[10px] font-medium disabled:opacity-35"
                      style={{
                        background: 'var(--surface-muted)',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: disabled ? 'not-allowed' : 'pointer',
                        transition: 'background 0.1s, color 0.1s',
                      }}
                      onMouseEnter={(e) => { if (!disabled) { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.color = 'var(--text)' } }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-muted)'; e.currentTarget.style.color = 'var(--text-muted)' }}
                    >
                      <Icon size={10} />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="flex-none flex gap-1 px-3 py-2.5 border-b" style={{ borderColor: 'var(--border)' }}>
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id
                const Icon = tab.icon
                return (
                  <button key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-medium"
                    style={{
                      background: isActive ? 'var(--accent)' : 'transparent',
                      color: isActive ? '#ffffff' : 'var(--text-muted)',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'background 0.12s, color 0.12s',
                    }}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--surface-muted)' }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                  >
                    <Icon size={12} />
                    {tab.label}
                  </button>
                )
              })}
            </div>

            {/* Action Bar */}
            <div className="flex-none px-3 py-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <button onClick={resetCanvas}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] font-medium"
                style={{
                  background: 'var(--surface-muted)',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  transition: 'background 0.1s, color 0.1s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--border)'; e.currentTarget.style.color = 'var(--text)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-muted)'; e.currentTarget.style.color = 'var(--text-muted)' }}
              >
                <RotateCcw size={11} />
                {t(language, 'left.newCanvas')}
              </button>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab + (activeMapId || '')}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.12 }}
                  className="p-3"
                >
                  {activeTab === 'map' && <MapTab />}
                  {activeTab === 'layers' && <LayersTab />}
                  {activeTab === 'visual' && <VisualTab />}
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  )
}
