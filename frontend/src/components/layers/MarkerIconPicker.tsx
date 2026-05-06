import { useState, useMemo, useRef, useEffect } from 'react'
import { MapPin, X, ImagePlus } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '../../stores/appStore'
import { t } from '../../i18n'
import { getIconByName, getIconsByCategory, tintSvg, extractSvgFromReactComponent, setCustomIcons, type IconDefinition } from '../../lib/mapIcons'
import { iconifyApi, customIconApi } from '../../services/api'

type PickerTab = 'built-in' | 'search' | 'paste' | 'file'

export default function MarkerIconPicker({ blockConfig, onChange }: {
  blockConfig: Record<string, unknown>
  onChange: (icon: string | undefined) => void
}) {
  const { language } = useAppStore()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<PickerTab>('built-in')
  const [pasteCode, setPasteCode] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<string[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchSvgs, setSearchSvgs] = useState<Record<string, string>>({})
  const fileRef = useRef<HTMLInputElement>(null)
  const searchDebounce = useRef<ReturnType<typeof setTimeout>>()
  const currentIcon = blockConfig.markerIcon as string | undefined
  const iconColor = (blockConfig.markerIconColor as string) || (blockConfig.markerColor as string) || '#d9822b'
  const iconSize = 20

  const handleFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.svg')) { toast.error(t(language, 'icon.onlySvg')); return }
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = String(e.target?.result || '')
      if (!text.includes('<svg')) { toast.error(t(language, 'icon.invalidSvg')); return }
      onChange(text)
      setOpen(false)
      toast.success(t(language, 'icon.svgLoaded'))
    }
    reader.readAsText(file)
  }

  const handlePaste = () => {
    const code = pasteCode.trim()
    if (!code) { toast.error(t(language, 'icon.pasteFirst')); return }
    let svg: string | null = null
    if (code.startsWith('<svg')) { svg = code } else { svg = extractSvgFromReactComponent(code) }
    if (!svg || !svg.includes('<svg')) {
      toast.error(t(language, 'icon.cannotExtractSvg'))
      return
    }
    onChange(svg)
    setPasteCode('')
    setOpen(false)
    toast.success(t(language, 'icon.added'))
  }

  useEffect(() => {
    if (tab !== 'search') return
    const q = searchQuery.trim()
    if (!q) { setSearchResults([]); return }
    if (searchDebounce.current) clearTimeout(searchDebounce.current)
    searchDebounce.current = setTimeout(async () => {
      setIsSearching(true)
      try {
        const data = await iconifyApi.search(q, 48)
        setSearchResults(data.icons || [])
      } catch { toast.error(t(language, 'icon.searchError')) }
      finally { setIsSearching(false) }
    }, 350)
    return () => { if (searchDebounce.current) clearTimeout(searchDebounce.current) }
  }, [searchQuery, tab])

  const handleSelectSearchIcon = async (fullName: string) => {
    const [prefix, name] = fullName.split(':')
    if (!prefix || !name) return
    if (searchSvgs[fullName]) { onChange(searchSvgs[fullName]); setOpen(false); return }
    try {
      const data = await iconifyApi.getSvg(prefix, name)
      const svg = data.svg
      setSearchSvgs(prev => ({ ...prev, [fullName]: svg }))
      onChange(svg)
      setOpen(false)
    } catch { toast.error(t(language, 'icon.loadSvgError')) }
  }

  const handleSaveToCatalog = async () => {
    const svg = currentIcon
    if (!svg || !svg.startsWith('<svg')) { toast.error(t(language, 'icon.selectSvgFirst')); return }
    const label = prompt(t(language, 'icon.savePrompt'))
    if (!label) return
    const category = prompt(t(language, 'icon.categoryPrompt')) || t(language, 'icon.customCategory')
    const safeName = 'custom-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    try {
      const newIcon: IconDefinition = { name: safeName, label, category, svg }
      await customIconApi.create(newIcon)
      const updated = await customIconApi.list()
      setCustomIcons(updated)
      onChange(safeName)
      toast.success(t(language, 'icon.savedToCatalog', { name: label }))
    } catch (err: any) { toast.error(err.message || t(language, 'icon.saveError')) }
  }

  const handleDeleteCustom = async (name: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(t(language, 'icon.removeConfirm', { name }))) return
    try {
      await customIconApi.delete(name)
      const updated = await customIconApi.list()
      setCustomIcons(updated)
      if (currentIcon === name) onChange(undefined)
      toast.success(t(language, 'icon.removed'))
    } catch (err: any) { toast.error(err.message || t(language, 'icon.removeError')) }
  }

  const previewSvg = useMemo(() => {
    if (!currentIcon) return null
    if (currentIcon.startsWith('<svg')) return tintSvg(currentIcon, iconColor)
    return getIconByName(currentIcon)?.svg || null
  }, [currentIcon, iconColor])

  const categories = useMemo(() => getIconsByCategory(), [open])

  

  return (
    <div className="space-y-1.5">
      <label className="text-xs text-[var(--text-subtle)] font-medium">{t(language, 'icon.markerIcon')}</label>
      <div
        className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-2 cursor-pointer hover:border-[var(--accent)] transition-colors"
        onClick={() => setOpen(!open)}>
        {previewSvg ? (
          <div className="flex-shrink-0" style={{ width: iconSize, height: iconSize, color: iconColor }}
            dangerouslySetInnerHTML={{ __html: previewSvg }} />
        ) : (
          <div className="flex-shrink-0" style={{ width: iconSize, height: iconSize, color: iconColor }}>
            <MapPin size={iconSize} />
          </div>
        )}
        <span className="text-sm text-[var(--text)] flex-1 truncate">
          {currentIcon
            ? currentIcon.startsWith('<svg') ? t(language, 'icon.customSvg') : getIconByName(currentIcon)?.label || currentIcon
            : t(language, 'icon.defaultCircle')}
        </span>
        {currentIcon && (
          <>
            {currentIcon.startsWith('<svg') && (
              <button onClick={(e) => { e.stopPropagation(); handleSaveToCatalog() }}
                title={t(language, 'icon.saveCatalog')}
                className="p-0.5 text-[var(--text-subtle)] hover:text-[var(--accent)] rounded transition-colors">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); onChange(undefined) }}
              className="p-0.5 text-[var(--text-subtle)] hover:text-red-500 rounded transition-colors">
              <X size={14} />
            </button>
          </>
        )}
      </div>

      {open && (
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface-strong)] p-2 space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
          <div className="flex gap-1 border-b border-[var(--border)] pb-1.5">
            {([
               { id: 'built-in' as const, label: t(language, 'icon.catalog') },
               { id: 'search' as const, label: t(language, 'icon.search') },
               { id: 'paste' as const, label: t(language, 'icon.paste') },
               { id: 'file' as const, label: t(language, 'icon.file') },
            ]).map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="px-2 py-1 rounded text-[10px] font-semibold transition-colors"
                style={{
                  background: tab === t.id ? 'var(--accent-soft)' : 'transparent',
                  color: tab === t.id ? 'var(--accent)' : 'var(--text-subtle)',
                }}>
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'built-in' && (
            <div className="space-y-2">
              {Object.entries(categories).map(([category, icons]) => (
                <div key={category}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)] mb-1">{category}</p>
                  <div className="grid grid-cols-5 gap-1">
                    {icons.map((icon) => {
                      const isActive = currentIcon === icon.name
                      const isCustom = icon.name.startsWith('custom-')
                      return (
                        <button key={icon.name} onClick={() => { onChange(icon.name); setOpen(false) }} title={icon.label}
                          className={`relative flex items-center justify-center rounded-md p-1.5 transition hover:scale-105 ${isActive ? 'bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]' : 'hover:bg-[var(--surface-muted)]'}`}>
                          <div style={{ width: 18, height: 18, color: iconColor }} dangerouslySetInnerHTML={{ __html: icon.svg }} />
                          {isCustom && (
                            <span onClick={(e) => handleDeleteCustom(icon.name, e)}
                              className="absolute -top-1 -right-1 w-3.5 h-3.5 flex items-center justify-center rounded-full bg-red-500/90 text-white text-[8px] cursor-pointer hover:bg-red-600"
                              title={t(language, 'common.remove')}>×</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'search' && (
            <div className="space-y-2">
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t(language, 'icon.searchPlaceholder')}
                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-md px-2 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]" />
              {isSearching && (
                <div className="flex items-center justify-center py-4">
                  <div className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {!isSearching && searchResults.length === 0 && searchQuery.trim() && (
                 <p className="text-[10px] text-[var(--text-subtle)] text-center py-2">{t(language, 'common.noResults')}</p>
              )}
              {!isSearching && searchResults.length > 0 && (
                <div className="grid grid-cols-6 gap-1">
                  {searchResults.map((fullName) => {
                    const [prefix, name] = fullName.split(':')
                    return (
                      <button key={fullName} onClick={() => handleSelectSearchIcon(fullName)}
                        title={`${prefix}:${name}`}
                        className="flex flex-col items-center justify-center rounded-md p-1 hover:bg-[var(--surface-muted)] transition group">
                        <div className="w-5 h-5 text-[var(--text)] flex items-center justify-center">
                          {searchSvgs[fullName] ? (
                            <div dangerouslySetInnerHTML={{ __html: searchSvgs[fullName] }} />
                          ) : (
                            <span className="text-[8px] text-[var(--text-subtle)]">{name.slice(0, 3)}</span>
                          )}
                        </div>
                        <span className="text-[7px] text-[var(--text-subtle)] truncate w-full text-center mt-0.5">{name}</span>
                      </button>
                    )
                  })}
                </div>
              )}
              <p className="text-[9px] text-[var(--text-subtle)] text-center">{t(language, 'icon.iconifyHint')}</p>
            </div>
          )}

          {tab === 'paste' && (
            <div className="space-y-2">
              <p className="text-[10px] text-[var(--text-subtle)]">
                 {t(language, 'icon.pasteHint')}
              </p>
              <textarea value={pasteCode} onChange={(e) => setPasteCode(e.target.value)}
                placeholder={`import type { SVGProps } from "react";\nexport function MynauiPlaneSolid(props) {...}`}
                className="w-full h-28 bg-[var(--surface)] border border-[var(--border)] rounded-md px-2 py-1.5 text-[11px] font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)] resize-none custom-scrollbar" />
              <div className="flex gap-2">
                <button onClick={handlePaste}
                  className="flex-1 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-white font-semibold rounded-md transition-all text-[11px]">
                  {t(language, 'icon.useIcon')}
                </button>
                <button onClick={() => setPasteCode('')}
                  className="px-3 py-1.5 border border-[var(--border)] rounded-md text-[11px] font-semibold text-[var(--text-subtle)] hover:bg-[var(--surface-muted)] transition-colors">
                  {t(language, 'common.clear')}
                </button>
              </div>
            </div>
          )}

          {tab === 'file' && (
            <div className="space-y-2">
              <div className="border border-dashed border-[var(--border)] rounded-md p-4 flex flex-col items-center gap-2 cursor-pointer hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors"
                onClick={() => fileRef.current?.click()}>
                <ImagePlus size={20} className="text-[var(--text-subtle)]" />
                <span className="text-[11px] text-[var(--text-subtle)]">{t(language, 'icon.clickLoadSvg')}</span>
                <input ref={fileRef} type="file" accept=".svg" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.currentTarget.value = '' }} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function GeoJsonLayerIconPicker({ layer, onChange }: {
  layer: { icon?: string; iconColor?: string; color: string }
  onChange: (patch: Record<string, unknown>) => void
}) {
  const { language } = useAppStore()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<PickerTab>('built-in')
  const [pasteCode, setPasteCode] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<string[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchSvgs, setSearchSvgs] = useState<Record<string, string>>({})
  const fileRef = useRef<HTMLInputElement>(null)
  const searchDebounce = useRef<ReturnType<typeof setTimeout>>()

  const currentIconName = layer.icon
  const currentIconColor = layer.iconColor || layer.color || '#d9822b'

  const handleFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.svg')) { toast.error(t(language, 'icon.onlySvg')); return }
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = String(e.target?.result || '')
      if (!text.includes('<svg')) { toast.error(t(language, 'icon.invalidSvg')); return }
      onChange({ icon: text })
      setOpen(false)
      toast.success(t(language, 'icon.svgLoaded'))
    }
    reader.readAsText(file)
  }

  const handlePaste = () => {
    const code = pasteCode.trim()
    if (!code) { toast.error(t(language, 'icon.pasteFirst')); return }
    let svg: string | null = null
    if (code.startsWith('<svg')) { svg = code } else { svg = extractSvgFromReactComponent(code) }
    if (!svg || !svg.includes('<svg')) {
      toast.error(t(language, 'icon.cannotExtractSvg'))
      return
    }
    onChange({ icon: svg })
    setPasteCode('')
    setOpen(false)
    toast.success(t(language, 'icon.added'))
  }

  useEffect(() => {
    if (tab !== 'search') return
    const q = searchQuery.trim()
    if (!q) { setSearchResults([]); return }
    if (searchDebounce.current) clearTimeout(searchDebounce.current)
    searchDebounce.current = setTimeout(async () => {
      setIsSearching(true)
      try {
        const data = await iconifyApi.search(q, 48)
        setSearchResults(data.icons || [])
      } catch { toast.error(t(language, 'icon.searchError')) }
      finally { setIsSearching(false) }
    }, 350)
    return () => { if (searchDebounce.current) clearTimeout(searchDebounce.current) }
  }, [searchQuery, tab])

  const handleSelectSearchIcon = async (fullName: string) => {
    const [prefix, name] = fullName.split(':')
    if (!prefix || !name) return
    if (searchSvgs[fullName]) { onChange({ icon: searchSvgs[fullName] }); setOpen(false); return }
    try {
      const data = await iconifyApi.getSvg(prefix, name)
      const svg = data.svg
      setSearchSvgs(prev => ({ ...prev, [fullName]: svg }))
      onChange({ icon: svg })
      setOpen(false)
    } catch { toast.error(t(language, 'icon.loadSvgError')) }
  }

  const handleSaveToCatalog = async () => {
    const svg = currentIconName
    if (!svg || !svg.startsWith('<svg')) { toast.error(t(language, 'icon.selectSvgFirst')); return }
    const label = prompt(t(language, 'icon.savePrompt'))
    if (!label) return
    const category = prompt(t(language, 'icon.categoryPrompt')) || t(language, 'icon.customCategory')
    const safeName = 'custom-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    try {
      const newIcon: IconDefinition = { name: safeName, label, category, svg }
      await customIconApi.create(newIcon)
      const updated = await customIconApi.list()
      setCustomIcons(updated)
      onChange({ icon: safeName })
      toast.success(t(language, 'icon.savedToCatalog', { name: label }))
    } catch (err: any) { toast.error(err.message || t(language, 'icon.saveError')) }
  }

  const handleDeleteCustom = async (name: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(t(language, 'icon.removeConfirm', { name }))) return
    try {
      await customIconApi.delete(name)
      const updated = await customIconApi.list()
      setCustomIcons(updated)
      if (currentIconName === name) onChange({ icon: undefined, iconColor: undefined })
      toast.success(t(language, 'icon.removed'))
    } catch (err: any) { toast.error(err.message || t(language, 'icon.removeError')) }
  }

  const currentSvg = useMemo(() => {
    if (!currentIconName) return null
    if (currentIconName.startsWith('<svg')) return tintSvg(currentIconName, currentIconColor)
    return getIconByName(currentIconName)?.svg || null
  }, [currentIconName, currentIconColor])

  const categories = useMemo(() => getIconsByCategory(), [open])

  return (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase tracking-wide text-[var(--text-subtle)] font-semibold">{currentIconName ? t(language, 'icon.file') : t(language, 'icon.markerIcon')}</label>
      <div
        className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 cursor-pointer hover:border-[var(--accent)] transition-colors"
        onClick={() => setOpen(!open)}>
        {currentSvg ? (
          <div className="flex-shrink-0" style={{ width: 16, height: 16, color: currentIconColor }}
            dangerouslySetInnerHTML={{ __html: currentSvg }} />
        ) : (
          <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ background: layer.color }} />
        )}
        <span className="text-xs text-[var(--text)] flex-1 truncate">
          {currentIconName
            ? currentIconName.startsWith('<svg') ? t(language, 'icon.customSvg') : getIconByName(currentIconName)?.label || currentIconName
            : t(language, 'icon.defaultCircle')}
        </span>
        {currentIconName && (
          <>
            {currentIconName.startsWith('<svg') && (
              <button onClick={(e) => { e.stopPropagation(); handleSaveToCatalog() }}
                title={t(language, 'icon.saveCatalog')}
                className="p-0.5 text-[var(--text-subtle)] hover:text-[var(--accent)] rounded transition-colors">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              </button>
            )}
            <button onClick={(e) => { e.stopPropagation(); onChange({ icon: undefined, iconColor: undefined }) }}
              className="p-0.5 text-[var(--text-subtle)] hover:text-red-500 rounded transition-colors">
              <X size={12} />
            </button>
          </>
        )}
      </div>

      {currentIconName && !open && (
        <div className="space-y-1">
          <label className="text-[10px] text-[var(--text-subtle)]">{t(language, 'icon.iconColor')}</label>
          <div className="flex items-center gap-2">
            <input type="color" value={currentIconColor}
              onChange={(e) => onChange({ iconColor: e.target.value })}
              className="h-7 w-7 cursor-pointer rounded-sm border border-[var(--border)] bg-transparent p-0.5" />
            <input type="text" value={currentIconColor}
              onChange={(e) => onChange({ iconColor: e.target.value })}
              className="flex-1 text-xs rounded-md border px-2 py-1 bg-[var(--surface-strong)] border-[var(--border)] text-[var(--text)] focus:outline-none focus:border-[var(--accent)]" />
          </div>
        </div>
      )}

      {open && (
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface-strong)] p-2 space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
          <div className="flex gap-1 border-b border-[var(--border)] pb-1.5">
            {([
              { id: 'built-in' as const, label: t(language, 'icon.catalog') },
              { id: 'search' as const, label: t(language, 'icon.search') },
              { id: 'paste' as const, label: t(language, 'icon.paste') },
              { id: 'file' as const, label: t(language, 'icon.file') },
            ]).map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className="px-2 py-1 rounded text-[10px] font-semibold transition-colors"
                style={{
                  background: tab === t.id ? 'var(--accent-soft)' : 'transparent',
                  color: tab === t.id ? 'var(--accent)' : 'var(--text-subtle)',
                }}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[10px] text-[var(--text-subtle)]">{t(language, 'visual.labelColor')}:</label>
            <input type="color" value={currentIconColor}
              onChange={(e) => onChange({ iconColor: e.target.value })}
              className="w-6 h-6 rounded-sm border border-[var(--border)] cursor-pointer p-0 bg-[var(--surface)]" />
          </div>

          {tab === 'built-in' && (
            <div className="space-y-2">
              {Object.entries(categories).map(([category, icons]) => (
                <div key={category}>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-subtle)] mb-1">{category}</p>
                  <div className="grid grid-cols-5 gap-1">
                    {icons.map((icon) => {
                      const isActive = currentIconName === icon.name
                      const isCustom = icon.name.startsWith('custom-')
                      return (
                        <button key={icon.name}
                          onClick={() => { onChange({ icon: icon.name }); /* don't close — user may change color */ }}
                          title={icon.label}
                          className={`relative flex items-center justify-center rounded-md p-1.5 transition hover:scale-105 ${isActive ? 'bg-[var(--accent-soft)] ring-1 ring-[var(--accent)]' : 'hover:bg-[var(--surface-muted)]'}`}>
                          <div style={{ width: 16, height: 16, color: currentIconColor }} dangerouslySetInnerHTML={{ __html: icon.svg }} />
                          {isCustom && (
                            <span onClick={(e) => handleDeleteCustom(icon.name, e)}
                              className="absolute -top-1 -right-1 w-3.5 h-3.5 flex items-center justify-center rounded-full bg-red-500/90 text-white text-[8px] cursor-pointer hover:bg-red-600"
                              title={t(language, 'common.remove')}>×</span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'search' && (
            <div className="space-y-2">
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t(language, 'icon.searchPlaceholder')}
                className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-md px-2 py-1.5 text-xs text-[var(--text)] focus:outline-none focus:border-[var(--accent)]" />
              {isSearching && (
                <div className="flex items-center justify-center py-4">
                  <div className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              {!isSearching && searchResults.length === 0 && searchQuery.trim() && (
                <p className="text-[10px] text-[var(--text-subtle)] text-center py-2">{t(language, 'common.noResults')}</p>
              )}
              {!isSearching && searchResults.length > 0 && (
                <div className="grid grid-cols-6 gap-1">
                  {searchResults.map((fullName) => {
                    const [prefix, name] = fullName.split(':')
                    return (
                      <button key={fullName} onClick={() => handleSelectSearchIcon(fullName)}
                        title={`${prefix}:${name}`}
                        className="flex flex-col items-center justify-center rounded-md p-1 hover:bg-[var(--surface-muted)] transition group">
                        <div className="w-5 h-5 text-[var(--text)] flex items-center justify-center">
                          {searchSvgs[fullName] ? (
                            <div dangerouslySetInnerHTML={{ __html: searchSvgs[fullName] }} />
                          ) : (
                            <span className="text-[8px] text-[var(--text-subtle)]">{name.slice(0, 3)}</span>
                          )}
                        </div>
                        <span className="text-[7px] text-[var(--text-subtle)] truncate w-full text-center mt-0.5">{name}</span>
                      </button>
                    )
                  })}
                </div>
              )}
              <p className="text-[9px] text-[var(--text-subtle)] text-center">{t(language, 'icon.iconifyHint')}</p>
            </div>
          )}

          {tab === 'paste' && (
            <div className="space-y-2">
              <p className="text-[10px] text-[var(--text-subtle)]">
                {t(language, 'icon.pasteHint')}
              </p>
              <textarea value={pasteCode} onChange={(e) => setPasteCode(e.target.value)}
                placeholder={`import type { SVGProps } from "react";\nexport function MynauiPlaneSolid(props) {...}`}
                className="w-full h-28 bg-[var(--surface)] border border-[var(--border)] rounded-md px-2 py-1.5 text-[11px] font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)] resize-none custom-scrollbar" />
              <div className="flex gap-2">
                <button onClick={handlePaste}
                  className="flex-1 py-1.5 bg-[var(--accent)] hover:bg-[var(--accent-strong)] text-white font-semibold rounded-md transition-all text-[11px]">
                  {t(language, 'icon.useIcon')}
                </button>
                <button onClick={() => setPasteCode('')}
                  className="px-3 py-1.5 border border-[var(--border)] rounded-md text-[11px] font-semibold text-[var(--text-subtle)] hover:bg-[var(--surface-muted)] transition-colors">
                  {t(language, 'common.clear')}
                </button>
              </div>
            </div>
          )}

          {tab === 'file' && (
            <div className="space-y-2">
              <div className="border border-dashed border-[var(--border)] rounded-md p-4 flex flex-col items-center gap-2 cursor-pointer hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] transition-colors"
                onClick={() => fileRef.current?.click()}>
                <ImagePlus size={20} className="text-[var(--text-subtle)]" />
                <span className="text-[11px] text-[var(--text-subtle)]">{t(language, 'icon.clickLoadSvg')}</span>
                <input ref={fileRef} type="file" accept=".svg" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.currentTarget.value = '' }} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
