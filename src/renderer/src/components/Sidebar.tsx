import { useState, useRef, useEffect, useCallback } from 'react'
import type { Track } from '../types'
import RadioPanel from './RadioPanel'

interface PlaylistTab {
  id: string
  name: string
}

interface Props {
  playlists: PlaylistTab[]
  activePlaylistId: string
  tracks: Track[]
  activeTrack: Track | null
  selectedTrack: Track | null
  onSelectTrack: (track: Track) => void
  onPlayTrack: (track: Track) => void
  onAddFiles: () => void
  onAddFolder: () => void
  onAddUrl: (url: string, name: string) => void
  onPlayStream: (url: string, name: string) => void
  radioActive: boolean
  onRadioTabChange: (active: boolean) => void
  onSelectPlaylist: (id: string) => void
  onAddPlaylist: () => void
  onRemovePlaylist: (id: string) => void
  onRenamePlaylist: (id: string, name: string) => void
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

const ART_SIZE = 84
const ART_COL = ART_SIZE + 8

type Group = { key: string; tracks: Track[]; coverDataUrl?: string }

function groupTracks(tracks: Track[]): Group[] {
  const groups: Group[] = []
  for (const track of tracks) {
    const albumKey = track.album ? `${track.album}` : null
    const last = groups[groups.length - 1]
    if (last && albumKey !== null && last.key === albumKey) {
      last.tracks.push(track)
    } else {
      const key = albumKey ?? `__${track.id}`
      groups.push({ key, tracks: [track], coverDataUrl: track.coverDataUrl })
    }
  }
  return groups
}

export default function Sidebar({
  playlists, activePlaylistId, tracks, activeTrack, selectedTrack,
  onSelectTrack, onPlayTrack, onAddFiles, onAddFolder, onAddUrl, onPlayStream,
  radioActive, onRadioTabChange,
  onSelectPlaylist, onAddPlaylist, onRemovePlaylist, onRenamePlaylist,
}: Props) {
  const groups = groupTracks(tracks)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [showUrlModal, setShowUrlModal] = useState(false)
  const [urlValue, setUrlValue] = useState('')
  const [urlName, setUrlName] = useState('')
  const [urlNameEdited, setUrlNameEdited] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const urlInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingId && inputRef.current) inputRef.current.select()
  }, [editingId])

  useEffect(() => {
    if (showUrlModal && urlInputRef.current) urlInputRef.current.focus()
  }, [showUrlModal])

  const handleUrlSubmit = useCallback(() => {
    const url = urlValue.trim()
    if (!url) return
    onAddUrl(url, urlName.trim())
    setUrlValue('')
    setUrlName('')
    setUrlNameEdited(false)
    setShowUrlModal(false)
  }, [urlValue, urlName, onAddUrl])

  const startEdit = (pl: PlaylistTab) => {
    setEditingId(pl.id)
    setEditingName(pl.name)
  }

  const commitEdit = (id: string) => {
    const trimmed = editingName.trim()
    if (trimmed) onRenamePlaylist(id, trimmed)
    setEditingId(null)
  }

  return (
    <div id="sidebar" style={styles.sidebar}>
      {/* Header */}
      <div id="sidebar-header" style={styles.header}>
        <span style={styles.title}>ZENTAPLAYER</span>
        <div style={styles.btnGroup}>
          <button id="sidebar-add-url-btn" style={styles.addBtn} onClick={() => setShowUrlModal(true)} title="Add stream URL">
            ⚡
          </button>
          <button id="sidebar-add-folder-btn" style={styles.addBtn} onClick={onAddFolder} title="Add folder">
            &#128193;
          </button>
          <button id="sidebar-add-btn" style={styles.addBtn} onClick={onAddFiles} title="Add audio files">
            +
          </button>
        </div>
        {showUrlModal && (
          <div style={styles.urlModal}>
            <div style={styles.urlModalTitle}>Add Stream URL</div>
            <input
              ref={urlInputRef}
              style={styles.urlInput}
              placeholder="https://stream.example.com/audio.mp3"
              value={urlValue}
              onChange={(e) => {
                setUrlValue(e.target.value)
                if (!urlNameEdited) {
                  try { setUrlName(new URL(e.target.value).hostname) } catch { setUrlName('') }
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleUrlSubmit()
                if (e.key === 'Escape') setShowUrlModal(false)
                e.stopPropagation()
              }}
            />
            <input
              style={styles.urlInput}
              placeholder="Name (optional)"
              value={urlName}
              onChange={(e) => { setUrlNameEdited(true); setUrlName(e.target.value) }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleUrlSubmit()
                if (e.key === 'Escape') setShowUrlModal(false)
                e.stopPropagation()
              }}
            />
            <div style={styles.urlModalBtns}>
              <button style={styles.urlCancelBtn} onClick={() => { setShowUrlModal(false); setUrlValue(''); setUrlName(''); setUrlNameEdited(false) }}>Cancel</button>
              <button style={styles.urlAddBtn} onClick={handleUrlSubmit}>Add</button>
            </div>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div id="sidebar-tabs" style={styles.tabBar}>
        <div style={styles.tabList}>
          {playlists.map((pl) => {
            const isActive = pl.id === activePlaylistId
            const isEditing = editingId === pl.id
            return (
              <div
                key={pl.id}
                style={{ ...styles.tab, ...(!radioActive && isActive ? styles.tabActive : {}) }}
                onClick={() => { onRadioTabChange(false); onSelectPlaylist(pl.id) }}
                onDoubleClick={() => startEdit(pl)}
                title={isEditing ? undefined : pl.name}
              >
                {isEditing ? (
                  <input
                    ref={inputRef}
                    style={styles.tabInput}
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={() => commitEdit(pl.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitEdit(pl.id)
                      if (e.key === 'Escape') setEditingId(null)
                      e.stopPropagation()
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span style={styles.tabLabel}>{pl.name}</span>
                )}
              </div>
            )
          })}
        </div>
        <div
          style={{ ...styles.tab, ...(radioActive ? styles.tabActive : {}), borderLeft: '1px solid var(--border)', flexShrink: 0 }}
          onClick={() => onRadioTabChange(true)}
          title="Radio"
        >
          <span style={styles.tabLabel}>⚡ Radio</span>
        </div>
        <button style={styles.addTabBtn} onClick={() => { onRadioTabChange(false); onAddPlaylist() }} title="New playlist">+</button>
        <button style={styles.removeTabBtn} onClick={() => onRemovePlaylist(activePlaylistId)} title="Remove playlist">−</button>
      </div>

      {/* Radio panel */}
      {radioActive && <RadioPanel onPlayStream={onPlayStream} />}

      {/* Track list */}
      {!radioActive && (tracks.length === 0 ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>♪</div>
          <div>Add audio files</div>
          <div style={styles.emptyHint}>MP3, FLAC, WAV, AAC</div>
        </div>
      ) : (
        <div id="sidebar-list" style={styles.list}>
          <div style={styles.colHeader}>
            <div style={styles.headerTrackCols}>
              <span style={{ ...styles.colLabel, ...styles.colArtist }}>ARTIST</span>
              <span style={{ ...styles.colLabel, ...styles.colAlbum }}>ALBUM</span>
              <span style={{ ...styles.colLabel, ...styles.colTitle }}>TITLE</span>
              <span style={{ ...styles.colLabel, ...styles.colDuration }}>#</span>
            </div>
            <div style={styles.headerArtCol} />
          </div>

          <div style={styles.rows}>
            {groups.map((group) => (
              <div key={group.key + group.tracks[0].id} style={styles.group}>
                <div style={styles.trackRows}>
                  {group.tracks.map((track) => {
                    const isPlaying = activeTrack?.id === track.id
                    const isSelected = selectedTrack?.id === track.id
                    const displayTitle = track.title ?? track.name
                    const artist = track.artist ?? '—'
                    const album = track.album ?? '—'
                    const duration = track.duration != null ? formatDuration(track.duration) : '—'
                    return (
                      <div
                        key={track.id}
                        style={{
                          ...styles.row,
                          ...(isPlaying ? styles.rowPlaying : isSelected ? styles.rowSelected : {}),
                        }}
                        onClick={() => onSelectTrack(track)}
                        onDoubleClick={() => onPlayTrack(track)}
                      >
                        <span style={{ ...styles.col, ...styles.colArtist }} title={artist}>{artist}</span>
                        <span style={{ ...styles.col, ...styles.colAlbum }} title={album}>{album}</span>
                        <span style={{ ...styles.col, ...styles.colTitle }} title={displayTitle}>
                          {isPlaying && <span style={styles.playingDot}>▶ </span>}
                          {displayTitle}
                        </span>
                        <span style={{ ...styles.col, ...styles.colDuration }}>{duration}</span>
                      </div>
                    )
                  })}
                </div>
                <div style={styles.artCell}>
                  {group.coverDataUrl ? (
                    <img src={group.coverDataUrl} alt="" style={styles.artImg} />
                  ) : (
                    <div style={styles.artPlaceholder} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-panel)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 12px',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
    position: 'relative' as const,
  },
  title: {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.12em',
    color: 'var(--accent)',
  },
  btnGroup: {
    display: 'flex',
    gap: 4,
  },
  addBtn: {
    background: 'var(--bg-hover)',
    border: '1px solid var(--border-bright)',
    color: 'var(--text-primary)',
    width: 24,
    height: 24,
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.1s',
  },
  tabBar: {
    display: 'flex',
    alignItems: 'stretch',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-base)',
    flexShrink: 0,
    minHeight: 30,
  },
  tabList: {
    display: 'flex',
    alignItems: 'stretch',
    flex: 1,
    minWidth: 0,
    overflowX: 'auto',
    scrollbarWidth: 'none',
  },
  tab: {
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
    cursor: 'pointer',
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-secondary)',
    borderRight: '1px solid var(--border)',
    borderBottom: '2px solid transparent',
    whiteSpace: 'nowrap',
    userSelect: 'none',
    transition: 'color 0.1s',
    flexShrink: 0,
  },
  tabActive: {
    color: 'var(--text-primary)',
    borderBottom: '2px solid var(--accent)',
    background: 'var(--bg-panel)',
  },
  tabLabel: {
    maxWidth: 120,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: 'block',
  },
  tabInput: {
    background: 'var(--bg-hover)',
    border: '1px solid var(--accent)',
    borderRadius: 2,
    color: 'var(--text-primary)',
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    padding: '1px 4px',
    width: 90,
    outline: 'none',
  },
  addTabBtn: {
    background: 'transparent',
    border: 'none',
    borderLeft: '1px solid var(--border)',
    color: '#4caf50',
    width: 28,
    cursor: 'pointer',
    fontSize: 16,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'color 0.1s',
  },
  removeTabBtn: {
    background: 'transparent',
    border: 'none',
    borderLeft: '1px solid var(--border)',
    color: '#4caf50',
    width: 28,
    cursor: 'pointer',
    fontSize: 18,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'color 0.1s',
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
    marginTop: 40,
    color: 'var(--text-secondary)',
    fontSize: 12,
  },
  emptyIcon: {
    fontSize: 28,
    opacity: 0.3,
  },
  emptyHint: {
    fontSize: 11,
    color: 'var(--text-secondary)',
  },
  list: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minHeight: 0,
  },
  colHeader: {
    display: 'flex',
    alignItems: 'center',
    height: 26,
    paddingLeft: 12,
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
    background: 'var(--bg-base)',
  },
  headerTrackCols: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
  },
  headerArtCol: {
    width: ART_COL,
    flexShrink: 0,
  },
  colLabel: {
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.1em',
    color: 'var(--text-secondary)',
    paddingRight: 8,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rows: {
    flex: 1,
    overflowY: 'auto',
  },
  group: {
    display: 'flex',
    alignItems: 'flex-start',
    borderBottom: '1px solid var(--border)',
  },
  trackRows: {
    flex: 1,
    minWidth: 0,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    height: 28,
    paddingLeft: 12,
    cursor: 'pointer',
    borderLeftWidth: 2,
    borderLeftStyle: 'solid',
    borderLeftColor: 'transparent',
    transition: 'background 0.08s',
  },
  rowPlaying: {
    background: 'var(--bg-active)',
    borderLeftColor: 'var(--accent)',
  },
  rowSelected: {
    background: 'var(--bg-hover)',
    borderLeftColor: 'var(--border-bright)',
  },
  artCell: {
    width: ART_COL,
    flexShrink: 0,
    padding: 4,
  },
  artImg: {
    width: ART_SIZE,
    height: ART_SIZE,
    objectFit: 'cover',
    display: 'block',
    borderRadius: 2,
    padding: 6,
  },
  artPlaceholder: {
    width: ART_SIZE,
    height: ART_SIZE,
    border: '1px solid var(--border)',
    borderRadius: 2,
  },
  col: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 12,
    paddingRight: 8,
  },
  colArtist: {
    width: '22%',
    flexShrink: 0,
    color: 'var(--text-secondary)',
  },
  colAlbum: {
    width: '22%',
    flexShrink: 0,
    color: 'var(--text-secondary)',
  },
  colTitle: {
    flex: 1,
    color: 'var(--text-secondary)',
    minWidth: 0,
  },
  colDuration: {
    width: 40,
    flexShrink: 0,
    textAlign: 'right',
    paddingRight: 0,
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
  },
  playingDot: {
    color: 'var(--accent)',
    fontSize: 9,
  },
  urlModal: {
    position: 'absolute' as const,
    top: 44,
    left: 12,
    right: 12,
    background: 'var(--bg-hover)',
    border: '1px solid var(--border-bright)',
    borderRadius: 6,
    padding: '12px',
    zIndex: 100,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
    boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
  },
  urlModalTitle: {
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: 'var(--text-secondary)',
  },
  urlInput: {
    background: 'var(--bg-base)',
    border: '1px solid var(--border-bright)',
    borderRadius: 4,
    color: 'var(--text-primary)',
    fontSize: 12,
    fontFamily: 'var(--font-mono)',
    padding: '5px 8px',
    outline: 'none',
    width: '100%',
  },
  urlModalBtns: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 6,
    marginTop: 2,
  },
  urlCancelBtn: {
    background: 'transparent',
    border: '1px solid var(--border-bright)',
    borderRadius: 4,
    color: 'var(--text-secondary)',
    fontSize: 11,
    padding: '4px 10px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
  },
  urlAddBtn: {
    background: 'var(--accent-dim)',
    border: '1px solid var(--accent-border)',
    borderRadius: 4,
    color: 'var(--accent)',
    fontSize: 11,
    fontWeight: 600,
    padding: '4px 10px',
    cursor: 'pointer',
    fontFamily: 'var(--font)',
  },
}
