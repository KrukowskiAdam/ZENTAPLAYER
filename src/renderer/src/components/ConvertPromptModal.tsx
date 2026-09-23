import { useState } from 'react'
import { CloseSquare } from 'react-iconly'
import { Disc } from './icons'

type CueInfo = Record<string, { trackCount: number; albumTitle?: string } | null>

interface Props {
  losslessPaths: string[]
  cueInfo: CueInfo
  converting: boolean
  progress: { done: number; total: number; file: string } | null
  ffmpegAvailable: boolean | null
  onConvert: (deleteOriginal: boolean) => void
  onKeepOriginal?: () => void
  onCancel: () => void
  onCancelConverting: () => void
  headerTitle?: string
  promptText?: string
}

const IS_WINDOWS = (window as any).electronAPI?.platform === 'win32'
// A fresh install only lands on PATH for processes started afterwards, so on Windows the
// app has to be reopened before it can see ffmpeg; Homebrew's dirs are searched directly.
const FFMPEG_INSTALL_HINT = IS_WINDOWS ? 'winget install ffmpeg' : 'brew install ffmpeg'

function baseName(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

export default function ConvertPromptModal({
  losslessPaths, cueInfo, converting, progress, ffmpegAvailable, onConvert, onKeepOriginal, onCancel, onCancelConverting,
  headerTitle, promptText,
}: Props) {
  const [deleteOriginal, setDeleteOriginal] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const cueFiles = losslessPaths.filter((p) => cueInfo[p])
  const plainFiles = losslessPaths.filter((p) => !cueInfo[p])

  const flacCount = plainFiles.filter((p) => p.toLowerCase().endsWith('.flac')).length
  const wavCount = plainFiles.filter((p) => p.toLowerCase().endsWith('.wav')).length
  const parts: string[] = []
  if (flacCount) parts.push(`${flacCount} FLAC`)
  if (wavCount) parts.push(`${wavCount} WAV`)

  const totalOutputTracks = losslessPaths.reduce((sum, p) => sum + (cueInfo[p]?.trackCount ?? 1), 0)

  const pct = progress ? Math.round((progress.done / Math.max(progress.total, 1)) * 100) : 0

  return (
    <div style={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget && !converting) onCancel() }}>
      <div style={styles.panel}>
        <div style={styles.header}>
          <span style={styles.headerTitle}>{headerTitle ?? 'Convert to MP3?'}</span>
          {!converting && (
            <button style={styles.closeBtn} onClick={onCancel}>
              <CloseSquare set="light" size={13} primaryColor="currentColor" />
            </button>
          )}
        </div>

        {converting ? (
          <>
            <div style={styles.body}>
              <div style={styles.progressLabel}>
                Converting {progress?.done ?? 0} / {progress?.total ?? losslessPaths.length}
                {progress?.file ? ` — ${progress.file}` : ''}
              </div>
              <div style={styles.progressTrack}>
                <div style={{ ...styles.progressFill, width: `${pct}%` }} />
              </div>
            </div>
            <div style={styles.footer}>
              <button
                style={styles.cancelBtn}
                disabled={cancelling}
                onClick={() => { setCancelling(true); onCancelConverting() }}
              >
                {cancelling ? 'Stopping…' : 'Cancel'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={styles.body}>
              <p style={styles.text}>
                {promptText ?? (
                  <>
                    Found {losslessPaths.length} lossless file{losslessPaths.length > 1 ? 's' : ''}
                    {parts.length ? ` (${parts.join(' + ')})` : ''}. Convert to MP3 to save disk space?
                    Tags (artist, album, title, cover art) will be preserved.
                  </>
                )}
              </p>

              {cueFiles.length > 0 && (
                <div style={styles.cueList}>
                  {cueFiles.map((p) => {
                    const info = cueInfo[p]!
                    return (
                      <div key={p} style={styles.cueRow}>
                        <span style={styles.cueIcon}><Disc size={13} color="currentColor" /></span>
                        <span style={styles.cueText}>
                          <strong>{info.albumTitle || baseName(p)}</strong> — cue sheet found, will split into{' '}
                          {info.trackCount} tracks
                        </span>
                      </div>
                    )
                  })}
                  {totalOutputTracks !== losslessPaths.length && (
                    <div style={styles.cueTotal}>{totalOutputTracks} MP3 tracks total</div>
                  )}
                </div>
              )}

              {ffmpegAvailable === false ? (
                <div style={styles.warning}>
                  ffmpeg not found — install it to enable conversion (<code>{FFMPEG_INSTALL_HINT}</code>){IS_WINDOWS && ', then restart Espresso Player'}.
                  These files can still be added in their original format.
                </div>
              ) : (
                <label style={styles.checkboxRow}>
                  <input
                    type="checkbox"
                    checked={deleteOriginal}
                    onChange={(e) => setDeleteOriginal(e.target.checked)}
                  />
                  Delete original files after conversion
                </label>
              )}
            </div>

            <div style={styles.footer}>
              <button style={styles.cancelBtn} onClick={onCancel}>Cancel</button>
              {onKeepOriginal && (
                <button style={styles.keepBtn} onClick={onKeepOriginal}>Keep Original</button>
              )}
              <button
                style={{ ...styles.convertBtn, ...(ffmpegAvailable === false ? styles.convertBtnDisabled : {}) }}
                onClick={() => onConvert(deleteOriginal)}
                disabled={ffmpegAvailable === false}
              >
                Convert to MP3
              </button>
            </div>
          </>
        )}
      </div>
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
    width: 440,
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
  body: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  text: {
    fontSize: 12,
    lineHeight: 1.5,
    color: 'var(--text-primary)',
  },
  cueList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    background: 'var(--bg-base)',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '8px 10px',
  },
  cueRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 7,
    fontSize: 11,
    lineHeight: 1.4,
    color: 'var(--text-secondary)',
  },
  cueIcon: {
    flexShrink: 0,
    fontSize: 12,
  },
  cueText: {
    color: 'var(--text-primary)',
  },
  cueTotal: {
    fontSize: 10,
    color: 'var(--accent)',
    fontFamily: 'var(--font-mono)',
    paddingLeft: 19,
  },
  warning: {
    fontSize: 11,
    lineHeight: 1.5,
    color: 'var(--warning)',
    background: 'var(--warning-dim)',
    border: '1px solid var(--warning-border)',
    borderRadius: 4,
    padding: '8px 10px',
    fontFamily: 'var(--font-mono)',
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 12,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
  progressLabel: {
    fontSize: 12,
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-mono)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    background: 'var(--bg-base)',
    border: '1px solid var(--border)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: 'var(--accent)',
    transition: 'width 0.15s ease-out',
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
  keepBtn: {
    background: 'transparent',
    border: '1px solid var(--border-bright)',
    borderRadius: 4,
    color: 'var(--text-primary)',
    fontSize: 12,
    padding: '6px 14px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
  },
  convertBtn: {
    background: 'var(--accent)',
    border: '1px solid var(--accent)',
    borderRadius: 4,
    color: 'var(--on-accent)',
    fontSize: 12,
    fontWeight: 700,
    padding: '6px 16px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
  },
  convertBtnDisabled: {
    opacity: 0.35,
    cursor: 'default',
  },
}
