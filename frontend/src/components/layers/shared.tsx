import { ChevronRight, Eye, EyeOff, Trash2, Upload, FileSpreadsheet } from 'lucide-react'
import { useAppStore } from '../../stores/appStore'
import { t } from '../../i18n'

interface LayerCardProps {
  label: string
  sublabel: string
  hasData: boolean
  visible: boolean
  open: boolean
  icon?: React.ReactNode
  onToggleOpen: () => void
  onToggleVisible: () => void
  onClear?: () => void
  children: React.ReactNode
}

export default function LayerCard({
  label, sublabel, hasData, visible, open, icon,
  onToggleOpen, onToggleVisible, onClear, children,
}: LayerCardProps) {
  const { language } = useAppStore()
  return (
    <div className="rounded-lg border overflow-hidden"
      style={{ borderColor: hasData ? 'var(--accent)' : 'var(--border)', background: 'var(--surface-strong)' }}>
      <div className="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
        style={{ background: hasData ? 'var(--accent-soft)' : 'var(--surface-strong)' }}
        onClick={onToggleOpen}>
        <ChevronRight size={12} style={{
          color: 'var(--text-subtle)', flexShrink: 0,
          transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
          transition: 'transform 0.15s',
        }} />
        {icon && (
          <div className="flex-shrink-0" style={{ width: 16, height: 16 }}>{icon}</div>
        )}
        <div className="flex-1 min-w-0">
          <span className="text-[12px] font-semibold" style={{ color: hasData ? 'var(--accent)' : 'var(--text)' }}>
            {label}
          </span>
          <span className="ml-1.5 text-[10px]" style={{ color: 'var(--text-subtle)' }}>{sublabel}</span>
        </div>
        <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
          {(hasData || visible) && (
            <button onClick={onToggleVisible} title={visible ? t(language, 'common.hideLayer') : t(language, 'common.showLayer')}
              className="p-1 rounded transition-colors hover:bg-[var(--surface-muted)]"
              style={{ color: visible ? 'var(--text)' : 'var(--text-subtle)' }}>
              {visible ? <Eye size={13} /> : <EyeOff size={13} />}
            </button>
          )}
          {onClear && (
            <button onClick={onClear} title={t(language, 'common.removeLayer')}
              className="p-1 rounded transition-colors hover:bg-red-500/10 hover:text-red-500"
              style={{ color: 'var(--text-subtle)' }}>
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
      {open && (
        <div className="px-3 pb-3" style={{ borderTop: '1px solid var(--border)' }}>
          {children}
        </div>
      )}
    </div>
  )
}

export function Stepper({ steps, activeStep }: { steps: { label: string }[]; activeStep: number }) {
  return (
    <div className="flex items-start gap-0 mb-4">
      {steps.map((step, i) => {
        const isDone = i < activeStep
        const isActive = i === activeStep
        return (
          <div key={i} className="flex-1 flex flex-col items-center relative z-[1]">
            <div className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-[10px] font-bold transition-all"
              style={{
                background: isDone ? 'var(--success)' : isActive ? 'var(--accent)' : 'var(--surface)',
                border: `2px solid ${isDone ? 'var(--success)' : isActive ? 'var(--accent)' : 'var(--border)'}`,
                color: isDone || isActive ? '#fff' : 'var(--text-subtle)',
              }}>
              {isDone ? '✓' : i + 1}
            </div>
            <div className="text-[9px] mt-1 text-center font-medium"
              style={{ color: isActive ? 'var(--accent)' : isDone ? 'var(--success)' : 'var(--text-subtle)' }}>
              {step.label}
            </div>
            {i < steps.length - 1 && (
              <div className="absolute top-[10px] left-[50%] w-full h-[2px] z-0"
                style={{ background: isDone ? 'var(--success)' : 'var(--border)' }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 mb-2 mt-3 first:mt-0">
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-subtle)' }}>
        {children}
      </span>
    </div>
  )
}

export function DropZone({ isDragging, isUploading, accept, hint, compact, onDrop, onDragOver, onDragLeave, onFile }: {
  isDragging: boolean
  isUploading: boolean
  accept: string
  hint: string
  compact?: boolean
  onDrop: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onFile: (f: File) => void
}) {
  const { language } = useAppStore()
  const id = `file-upload-${accept.replace(/[^a-z]/g, '')}-${compact ? 'c' : 'f'}`
  if (compact) {
    return (
      <div onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
        className={`border border-dashed rounded-md transition-all cursor-pointer ${
          isDragging ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border)] hover:border-[var(--accent)] bg-[var(--surface-muted)]'}`}>
        <input type="file" accept={accept} className="hidden" id={id}
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.currentTarget.value = '' }} />
        <label htmlFor={id} className="cursor-pointer flex items-center justify-center gap-2 px-3 py-2">
          {isUploading
            ? <div className="w-3.5 h-3.5 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
            : <Upload size={13} className="text-[var(--text-subtle)]" />}
          <span className="text-[11px] text-[var(--text-muted)]">
            {isUploading ? t(language, 'common.loading') : hint}
          </span>
        </label>
      </div>
    )
  }
  return (
    <div onDrop={onDrop} onDragOver={onDragOver} onDragLeave={onDragLeave}
      className={`border-2 border-dashed rounded-md p-4 text-center transition-all cursor-pointer ${
        isDragging ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border)] hover:border-[var(--border-strong)] bg-[var(--surface-muted)]'}`}>
      <input type="file" accept={accept} className="hidden" id={id}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.currentTarget.value = '' }} />
      <label htmlFor={id} className="cursor-pointer flex flex-col items-center gap-3">
        {isUploading ? (
          <div className="w-10 h-10 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        ) : (
          <Upload className="w-10 h-10 text-[var(--text-subtle)]" />
        )}
        <div>
          <p className="text-sm text-[var(--text)] font-medium">{isUploading ? t(language, 'common.processing') : t(language, 'common.dragOrClickUpload')}</p>
          <p className="text-xs text-[var(--text-subtle)] mt-1">{hint}</p>
        </div>
      </label>
    </div>
  )
}

export function FileInfo({ name, onClear }: { name: string; onClear: () => void }) {
  return (
    <div className="flex items-center justify-between bg-[var(--surface-muted)] border border-[var(--border)] rounded-md p-3">
      <div className="flex items-center gap-2.5">
        <FileSpreadsheet className="w-5 h-5 text-[var(--accent)]" />
        <p className="text-sm text-[var(--text)] font-medium">{name}</p>
      </div>
      <button onClick={onClear}
        className="p-1.5 text-[var(--text-subtle)] hover:text-red-500 hover:bg-red-500/10 rounded-md transition-colors">
        <Trash2 size={16} />
      </button>
    </div>
  )
}

export function ColSelect({ label, value, columns, onChange }: {
  label: string; value: string; columns: string[]; onChange: (v: string) => void
}) {
  const { language } = useAppStore()
  return (
    <div className="space-y-1.5">
      <label className="text-xs text-[var(--text-subtle)] font-medium">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-[var(--surface)] border border-[var(--border)] rounded-md px-3 py-2 text-sm text-[var(--text)] focus:outline-none focus:border-[var(--accent)] appearance-none cursor-pointer">
        <option value="">{t(language, 'common.selectColumn')}</option>
        {columns.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </div>
  )
}
