import { useState, useEffect, useRef } from 'react'
import { CloseSquare } from 'react-iconly'
import type { Track } from '../types'

export interface TagWriteUpdate {
  path: string
  title?: string
  artist?: string
  album?: string
  trackNumber?: string
  year?: string
  genre?: string
}

interface FieldState {
  value: string
  changed: boolean
  various: boolean
}

function initField(tracks: Track[], getter: (t: Track) => string | number | undefined): FieldState {
  const vals = tracks.map(getter)
  const first = vals[0]
  const allSame = vals.every((v) => v === first)
  if (allSame) return { value: first != null ? String(first) : '', changed: false, various: false }
  return { value: '', changed: false, various: true }
}

interface Props {
  tracks: Track[]
  onSave: (updates: TagWriteUpdate[]) => Promise<void>
  onClose: () => void
}

export default function TagEditorModal({ tracks, onSave, onClose }: Props) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const firstRef = useRef<HTMLInputElement>(null)

  const [fields, setFields] = useState(() => ({
    title: initField(tracks, (t) => t.title),
    artist: initField(tracks, (t) => t.artist),
    album: initField(tracks, (t) => t.album),
    trackNumber: initField(tracks, (t) => t.trackNumber),
    year: initField(tracks, (t) => t.year),
    genre: initField(tracks, (t) => t.genre),
  }))

  useEffect(() => { firstRef.current?.focus() }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const setField = (key: keyof typeof fields, value: string) => {
    setFields((prev) => ({ ...prev, [key]: { ...prev[key], value, changed: true } }))
  }

  const handleSave = async () => {
    const updates: TagWriteUpdate[] = tracks.map((track) => {
      const u: TagWriteUpdate = { path: track.path }
      if (fields.title.changed) u.title = fields.title.value
      if (fields.artist.changed) u.artist = fields.artist.value
      if (fields.album.changed) u.album = fields.album.value
      if (fields.trackNumber.changed) u.trackNumber = fields.trackNumber.value
      if (fields.year.changed) u.year = fields.year.value
      if (fields.genre.changed) u.genre = fields.genre.value
      return u
    })
    setSaving(true)
    setError('')
    try {
      await onSave(updates)
    } catch (e: any) {
      setError(e.message ?? 'Save failed')
      setSaving(false)
    }
  }

  const hasChanges = Object.values(fields).some((f) => f.changed)
  const multi = tracks.length > 1

  return (
    <div style={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <span style={styles.headerTitle}>Edit Tags</span>
          {multi && <span style={styles.headerCount}>{tracks.length} tracks</span>}
          <button style={styles.closeBtn} onClick={onClose}>
            <CloseSquare set="light" size={13} primaryColor="currentColor" />
          </button>
        </div>

        {multi && (
          <div style={styles.multiHint}>
            Fields with <em>(various)</em> values will not change unless you type a new value.
          </div>
        )}

        <div style={styles.form}>
          <Field label="Title" field={fields.title} ref={firstRef} onChange={(v) => setField('title', v)} />
          <Field label="Artist" field={fields.artist} onChange={(v) => setField('artist', v)} />
          <Field label="Album" field={fields.album} onChange={(v) => setField('album', v)} />
          <div style={styles.row2}>
            <Field label="Track #" field={fields.trackNumber} width={90} onChange={(v) => setField('trackNumber', v)} />
            <Field label="Year" field={fields.year} width={90} onChange={(v) => setField('year', v)} />
            <Field label="Genre" field={fields.genre} flex onChange={(v) => setField('genre', v)} />
          </div>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.footer}>
          <button style={styles.cancelBtn} onClick={onClose} disabled={saving}>Cancel</button>
          <button
            style={{ ...styles.saveBtn, ...((!hasChanges || saving) ? styles.saveBtnDisabled : {}) }}
            onClick={handleSave}
            disabled={!hasChanges || saving}
          >
            {saving ? 'Saving…' : 'Save Tags'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface FieldProps {
  label: string
  field: FieldState
  onChange: (v: string) => void
  width?: number
  flex?: boolean
  ref?: React.Ref<HTMLInputElement>
}

function Field({ label, field, onChange, width, flex, ref }: FieldProps) {
  return (
    <div style={{ ...styles.fieldWrap, ...(flex ? { flex: 1 } : width ? { width } : {}) }}>
      <label style={styles.fieldLabel}>{label}</label>
      <input
        ref={ref}
        style={{
          ...styles.fieldInput,
          ...(field.changed ? styles.fieldInputChanged : {}),
        }}
        value={field.value}
        placeholder={field.various ? '(various)' : ''}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
      />
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  panel: {
    background: 'var(--bg-panel)',
    border: '1px solid var(--border-bright)',
    borderRadius: 8,
    width: 480,
    maxWidth: 'calc(100vw - 48px)',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid var(--border)',
    gap: 8,
  },
  headerTitle: {
    fontFamily: 'var(--font-mono)',
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: '0.06em',
    color: 'var(--accent)',
    flex: 1,
  },
  headerCount: {
    fontSize: 11,
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-mono)',
    background: 'var(--bg-hover)',
    padding: '2px 7px',
    borderRadius: 10,
  },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: 13,
    width: 24,
    height: 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    padding: 0,
    lineHeight: 1,
  },
  multiHint: {
    padding: '8px 16px',
    fontSize: 11,
    color: 'var(--text-secondary)',
    background: 'var(--bg-base)',
    borderBottom: '1px solid var(--border)',
    fontFamily: 'var(--font-mono)',
  },
  form: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  row2: {
    display: 'flex',
    gap: 8,
    alignItems: 'flex-end',
  },
  fieldWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.1em',
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-mono)',
  },
  fieldInput: {
    background: 'var(--bg-base)',
    border: '1px solid var(--border-bright)',
    borderRadius: 4,
    color: 'var(--text-primary)',
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
    padding: '6px 8px',
    outline: 'none',
    width: '100%',
    transition: 'border-color 0.1s',
  },
  fieldInputChanged: {
    borderColor: 'var(--accent-border)',
  },
  error: {
    margin: '0 16px 12px',
    padding: '6px 10px',
    background: 'var(--danger-dim)',
    border: '1px solid var(--danger-border)',
    borderRadius: 4,
    fontSize: 11,
    color: 'var(--danger)',
    fontFamily: 'var(--font-mono)',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 8,
    padding: '12px 16px',
    borderTop: '1px solid var(--border)',
    background: 'var(--bg-base)',
  },
  cancelBtn: {
    background: 'transparent',
    border: '1px solid var(--border-bright)',
    borderRadius: 4,
    color: 'var(--text-secondary)',
    fontSize: 12,
    padding: '6px 14px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
  },
  saveBtn: {
    background: 'var(--accent)',
    border: '1px solid var(--accent)',
    borderRadius: 4,
    color: 'var(--on-accent)',
    fontSize: 12,
    fontWeight: 700,
    padding: '6px 16px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    transition: 'opacity 0.1s',
  },
  saveBtnDisabled: {
    opacity: 0.35,
    cursor: 'default',
  },
}
