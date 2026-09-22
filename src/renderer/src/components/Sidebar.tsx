import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Search, Voice2, Edit, Delete, ArrowUp, ArrowDown, ChevronDown, ChevronRight, Plus,
  Heart, Folder, Document, Swap, Send, PaperDownload,
} from 'react-iconly'
import type { Track } from '../types'
import RadioPanel from './RadioPanel'
import TagEditorModal, { type TagWriteUpdate } from './TagEditorModal'
import { Disc } from './icons'
import brushedMetalUrl from '../assets/textures/brushed-metal.jpg'

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
  onPlayStream: (url: string, name: string) => void
  radioActive: boolean
  onRadioTabChange: (active: boolean) => void
  onSelectPlaylist: (id: string) => void
  onAddPlaylist: () => void
  onRemovePlaylist: (id: string) => void
  onRenamePlaylist: (id: string, name: string) => void
  onMoveGroup: (groupIndex: number, direction: 'up' | 'down') => void
  onUpdateTracks: (tracks: Track[]) => void
  onRemoveTracks: (ids: string[]) => void
  onDropToPlaylist: (id: string, paths: string[]) => void
  onConvertSelected: (trackIds: string[]) => void
  onMoveToPlaylist: (trackIds: string[], destPlaylistId: string, mode: 'move' | 'copy') => void
}

function pathsFromDrop(e: React.DragEvent): string[] {
  const api = (window as any).electronAPI
  if (!api?.getPathForFile) return []
  const paths: string[] = []
  for (const file of Array.from(e.dataTransfer.files)) {
    const p = api.getPathForFile(file)
    if (p) paths.push(p)
  }
  return paths
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function folderNameFromPath(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts.length >= 2 ? parts[parts.length - 2] : ''
}

const ART_SIZE = 214
const ART_COL = ART_SIZE + 8
const CTRL_COL = 32

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
  onSelectTrack, onPlayTrack, onAddFiles, onAddFolder, onPlayStream,
  radioActive, onRadioTabChange,
  onSelectPlaylist, onAddPlaylist, onRemovePlaylist, onRenamePlaylist, onMoveGroup,
  onUpdateTracks, onRemoveTracks, onDropToPlaylist, onConvertSelected, onMoveToPlaylist,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('')
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const searchQueryTrimmed = searchQuery.trim().toLowerCase()
  const searchedTracks = searchQueryTrimmed
    ? tracks.filter((t) => {
        const haystack = `${t.title ?? ''} ${t.artist ?? ''} ${t.album ?? ''} ${t.name}`.toLowerCase()
        return haystack.includes(searchQueryTrimmed)
      })
    : tracks
  const filteredTracks = favoritesOnly ? searchedTracks.filter((t) => t.favorite) : searchedTracks
  const groups = groupTracks(filteredTracks)
  // Move up/down reorders groups in the full, unfiltered playlist (App.tsx's
  // reorderGroups) by position — with a search or favorites filter narrowing which
  // groups are even visible here, a "visible" groupIndex no longer lines up with the
  // real position in the full list, so reordering must be disabled while filtered.
  const canReorderGroups = !searchQueryTrimmed && !favoritesOnly
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const multiTrackKeys = groups.filter(g => g.tracks.length > 1).map(g => g.key)
  const allCollapsed = multiTrackKeys.length > 0 && multiTrackKeys.every(k => collapsedGroups.has(k))
  const toggleAll = () => setCollapsedGroups(allCollapsed ? new Set() : new Set(multiTrackKeys))
  const toggleCollapse = useCallback((key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [anchorId, setAnchorId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [moveSubmenu, setMoveSubmenu] = useState<'move' | 'copy' | null>(null)
  const [tagEditorTracks, setTagEditorTracks] = useState<Track[] | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  const handleTabDragOver = useCallback((e: React.DragEvent, id: string) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
    setDragOverId(id)
  }, [])

  const handleTabDragLeave = useCallback((id: string) => {
    setDragOverId((cur) => (cur === id ? null : cur))
  }, [])

  const handleTabDrop = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault()
    setDragOverId(null)
    const paths = pathsFromDrop(e)
    if (paths.length) onDropToPlaylist(id, paths)
  }, [onDropToPlaylist])

  useEffect(() => {
    if (editingId && inputRef.current) inputRef.current.select()
  }, [editingId])

  useEffect(() => {
    setSearchQuery('')
  }, [activePlaylistId])

  useEffect(() => {
    if (!contextMenu) return
    const handler = () => { setContextMenu(null); setMoveSubmenu(null) }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [contextMenu])

  const startEdit = (pl: PlaylistTab) => {
    setEditingId(pl.id)
    setEditingName(pl.name)
  }

  const commitEdit = (id: string) => {
    const trimmed = editingName.trim()
    if (trimmed) onRenamePlaylist(id, trimmed)
    setEditingId(null)
  }

  const handleRowClick = useCallback((e: React.MouseEvent, track: Track) => {
    // Every click, regardless of modifier keys, moves the "selected track" pointer
    // (used e.g. by Space-bar play/pause when nothing is actively playing yet) —
    // otherwise a cmd/ctrl or shift click that only touches multi-selection leaves
    // it stale, so a row can look selected while playback controls do nothing.
    onSelectTrack(track)
    if (e.metaKey || e.ctrlKey) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        if (next.has(track.id)) next.delete(track.id)
        else next.add(track.id)
        return next
      })
      setAnchorId(track.id)
    } else if (e.shiftKey && anchorId) {
      const anchorIdx = filteredTracks.findIndex((t) => t.id === anchorId)
      const thisIdx = filteredTracks.findIndex((t) => t.id === track.id)
      const lo = Math.min(anchorIdx, thisIdx)
      const hi = Math.max(anchorIdx, thisIdx)
      setSelectedIds(new Set(filteredTracks.slice(lo, hi + 1).map((t) => t.id)))
    } else {
      setSelectedIds(new Set([track.id]))
      setAnchorId(track.id)
    }
  }, [filteredTracks, anchorId, onSelectTrack])

  const handleRowContextMenu = useCallback((e: React.MouseEvent, track: Track) => {
    e.preventDefault()
    e.stopPropagation()
    if (!selectedIds.has(track.id)) {
      setSelectedIds(new Set([track.id]))
      setAnchorId(track.id)
    }
    setMoveSubmenu(null)
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [selectedIds])

  const handleEditTags = useCallback(() => {
    const sel = tracks.filter((t) => selectedIds.has(t.id) && !t.isStream)
    if (sel.length > 0) setTagEditorTracks(sel)
    setContextMenu(null)
    setMoveSubmenu(null)
  }, [tracks, selectedIds])

  const handleRemoveSelected = useCallback(() => {
    onRemoveTracks([...selectedIds])
    setSelectedIds(new Set())
    setAnchorId(null)
    setContextMenu(null)
    setMoveSubmenu(null)
  }, [selectedIds, onRemoveTracks])

  const handleShowInFolder = useCallback(() => {
    const sel = tracks.find((t) => selectedIds.has(t.id) && !t.isStream)
    if (sel) (window as any).electronAPI?.showInFolder?.(sel.path)
    setContextMenu(null)
    setMoveSubmenu(null)
  }, [tracks, selectedIds])

  const handleCopyPath = useCallback(() => {
    const sel = tracks.filter((t) => selectedIds.has(t.id) && !t.isStream)
    if (sel.length) navigator.clipboard?.writeText(sel.map((t) => t.path).join('\n')).catch(() => {})
    setContextMenu(null)
    setMoveSubmenu(null)
  }, [tracks, selectedIds])

  const handleConvertClick = useCallback(() => {
    onConvertSelected([...selectedIds])
    setContextMenu(null)
    setMoveSubmenu(null)
  }, [selectedIds, onConvertSelected])

  const handleMoveOrCopyClick = useCallback((destPlaylistId: string, mode: 'move' | 'copy') => {
    onMoveToPlaylist([...selectedIds], destPlaylistId, mode)
    setContextMenu(null)
    setMoveSubmenu(null)
  }, [selectedIds, onMoveToPlaylist])

  const handleToggleFavorite = useCallback((e: React.MouseEvent, track: Track) => {
    e.stopPropagation()
    onUpdateTracks([{ ...track, favorite: !track.favorite }])
  }, [onUpdateTracks])

  const applyTagUpdates = useCallback(async (targetTracks: Track[], updates: TagWriteUpdate[]) => {
    const api = (window as any).electronAPI
    const results: Array<{ path: string; success: boolean; error?: string }> = await api.writeTags(updates)
    const failed = results.filter((r) => !r.success)
    if (failed.length > 0) {
      throw new Error(failed.map((f) => `${f.path}: ${f.error}`).join('\n'))
    }
    // Update in-memory track data from what was saved
    const updatedTracks = targetTracks.map((track) => {
      const u = updates.find((upd) => upd.path === track.path)
      if (!u) return track
      return {
        ...track,
        title: u.title !== undefined ? (u.title || undefined) : track.title,
        artist: u.artist !== undefined ? (u.artist || undefined) : track.artist,
        album: u.album !== undefined ? (u.album || undefined) : track.album,
        trackNumber: u.trackNumber !== undefined ? (u.trackNumber ? Number(u.trackNumber) : undefined) : track.trackNumber,
        year: u.year !== undefined ? (u.year || undefined) : track.year,
        genre: u.genre !== undefined ? (u.genre || undefined) : track.genre,
      }
    })
    onUpdateTracks(updatedTracks)
  }, [onUpdateTracks])

  const handleTagSave = useCallback(async (updates: TagWriteUpdate[]) => {
    await applyTagUpdates(tagEditorTracks ?? [], updates)
    setTagEditorTracks(null)
  }, [tagEditorTracks, applyTagUpdates])

  const handleSetAlbum = useCallback(async () => {
    const sel = tracks.filter((t) => selectedIds.has(t.id) && !t.isStream)
    setContextMenu(null)
    setMoveSubmenu(null)
    if (sel.length < 2) return
    // Each track gets its OWN containing folder's name as its album — using a single
    // name (e.g. the first track's folder) for every selection would mislabel any
    // track that isn't actually from that same folder.
    const updates: TagWriteUpdate[] = sel
      .map((t) => ({ path: t.path, album: folderNameFromPath(t.path) }))
      .filter((u) => u.album)
    if (!updates.length) return
    const updatedTracks = sel.filter((t) => updates.some((u) => u.path === t.path))
    try {
      await applyTagUpdates(updatedTracks, updates)
    } catch (e: any) {
      console.error('Failed to set album:', e)
    }
  }, [tracks, selectedIds, applyTagUpdates])

  const selectedNonStreamTracks = tracks.filter((t) => selectedIds.has(t.id) && !t.isStream)
  const convertibleCount = selectedNonStreamTracks.filter((t) => !t.path.toLowerCase().endsWith('.mp3')).length
  const otherPlaylists = playlists.filter((p) => p.id !== activePlaylistId)

  return (
    <div id="sidebar" style={styles.sidebar}>
      {/* Header */}
      <div id="sidebar-header" style={styles.header}>
        <span style={styles.title}>Espresso Player</span>
        <div style={styles.headerRight}>
          {!radioActive && (
            <div style={styles.searchBox}>
              <span style={styles.searchIcon}><Search set="light" size={12} primaryColor="currentColor" /></span>
              <input
                id="sidebar-search-input"
                style={styles.searchInput}
                placeholder="Search tracks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') { setSearchQuery(''); (e.target as HTMLInputElement).blur() }
                  e.stopPropagation()
                }}
              />
              {searchQuery && (
                <button style={styles.searchClear} onClick={() => setSearchQuery('')} title="Clear search">×</button>
              )}
            </div>
          )}
          {!radioActive && (
            <button
              id="sidebar-favorites-filter-btn"
              style={{ ...styles.favFilterBtn, ...(favoritesOnly ? styles.favFilterBtnActive : {}) }}
              onClick={() => setFavoritesOnly((v) => !v)}
              title={favoritesOnly ? 'Show all tracks' : 'Show favorites only'}
            >
              <Heart set={favoritesOnly ? 'bold' : 'light'} size={13} primaryColor="currentColor" />
            </button>
          )}
          <div style={styles.btnGroup}>
            <button id="sidebar-add-folder-btn" style={styles.addBtn} onClick={onAddFolder} title="Add folder">
              <span style={styles.addPlus}><Plus set="light" size={11} primaryColor="currentColor" /></span> Folder
            </button>
            <button id="sidebar-add-btn" style={styles.addBtn} onClick={onAddFiles} title="Add audio files">
              <span style={styles.addPlus}><Plus set="light" size={11} primaryColor="currentColor" /></span> File
            </button>
          </div>
        </div>
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
                style={{
                  ...styles.tab,
                  ...(!radioActive && isActive ? styles.tabActive : {}),
                  ...(dragOverId === pl.id ? styles.tabDragOver : {}),
                }}
                onClick={() => { onRadioTabChange(false); onSelectPlaylist(pl.id) }}
                onDoubleClick={() => startEdit(pl)}
                onDragOver={(e) => handleTabDragOver(e, pl.id)}
                onDragLeave={() => handleTabDragLeave(pl.id)}
                onDrop={(e) => handleTabDrop(e, pl.id)}
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
          <span style={styles.tabLabel}>
            <Voice2 set="light" size={12} primaryColor="currentColor" /> Radio
          </span>
        </div>
        <button style={styles.addTabBtn} onClick={() => { onRadioTabChange(false); onAddPlaylist() }} title="New playlist">+</button>
        <button style={styles.removeTabBtn} onClick={() => onRemovePlaylist(activePlaylistId)} title="Remove playlist">−</button>
      </div>

      {/* Radio panel */}
      {radioActive && <RadioPanel onPlayStream={onPlayStream} />}

      {/* Track list */}
      {!radioActive && (
        <>
          <div style={styles.colHeader}>
            <div style={styles.headerTrackCols}>
              <span style={{ ...styles.colLabel, ...styles.colArtist }}>ARTIST</span>
              <span style={{ ...styles.colLabel, ...styles.colAlbum }}>ALBUM</span>
              <span style={{ ...styles.colLabel, ...styles.colTitle }}>TITLE</span>
              <span style={{ ...styles.colLabel, ...styles.colDuration }}>#</span>
              <span style={styles.colFavorite} />
            </div>
            <div style={styles.headerArtCol} />
            <div style={{ width: CTRL_COL, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {multiTrackKeys.length > 0 && (
                <button
                  style={styles.ctrlBtn}
                  onClick={toggleAll}
                  title={allCollapsed ? 'Expand all' : 'Collapse all'}
                >
                  {allCollapsed
                    ? <ChevronRight set="light" size={12} primaryColor="currentColor" />
                    : <ChevronDown set="light" size={12} primaryColor="currentColor" />}
                </button>
              )}
            </div>
          </div>

          {tracks.length === 0 ? (
            <div
              style={{ ...styles.empty, ...(dragOverId === activePlaylistId ? styles.listDragOver : {}) }}
              onDragOver={(e) => handleTabDragOver(e, activePlaylistId)}
              onDragLeave={() => handleTabDragLeave(activePlaylistId)}
              onDrop={(e) => handleTabDrop(e, activePlaylistId)}
            >
              <div style={styles.emptyIcon}><Voice2 set="light" size={28} primaryColor="currentColor" /></div>
              <div>Add audio files</div>
              <div style={styles.emptyHint}>MP3, FLAC, WAV, AAC — or drag a folder here</div>
            </div>
          ) : filteredTracks.length === 0 ? (
            <div style={styles.empty}>
              <div style={styles.emptyIcon}>
                {searchQueryTrimmed
                  ? <Search set="light" size={28} primaryColor="currentColor" />
                  : <Heart set="light" size={28} primaryColor="currentColor" />}
              </div>
              <div>No tracks found</div>
              <div style={styles.emptyHint}>
                {searchQueryTrimmed ? `No results for "${searchQuery.trim()}"` : 'No favorites yet'}
              </div>
            </div>
          ) : (
            <div
              id="sidebar-list"
              style={{ ...styles.list, ...(dragOverId === activePlaylistId ? styles.listDragOver : {}) }}
              onDragOver={(e) => handleTabDragOver(e, activePlaylistId)}
              onDragLeave={() => handleTabDragLeave(activePlaylistId)}
              onDrop={(e) => handleTabDrop(e, activePlaylistId)}
            >
              <div style={styles.rows}>
                {groups.map((group, groupIndex) => {
                  const isCollapsed = collapsedGroups.has(group.key)
                  const visibleTracks = isCollapsed ? [group.tracks[0]] : group.tracks
                  return (
                    <div key={group.key + group.tracks[0].id} style={styles.group}>
                      <div style={styles.trackRows}>
                        {visibleTracks.map((track) => {
                          const isPlaying = activeTrack?.id === track.id
                          const isSelected = selectedTrack?.id === track.id
                          const displayTitle = track.title ?? track.name
                          const artist = track.artist ?? '—'
                          const album = track.album ?? '—'
                          const duration = track.duration != null ? formatDuration(track.duration) : '—'
                          const isMultiSelected = selectedIds.has(track.id)
                          return (
                            <div
                              key={track.id}
                              style={{
                                ...styles.row,
                                ...(isPlaying ? styles.rowPlaying : isMultiSelected ? styles.rowMultiSelected : isSelected ? styles.rowSelected : {}),
                              }}
                              onClick={(e) => handleRowClick(e, track)}
                              onDoubleClick={() => onPlayTrack(track)}
                              onContextMenu={(e) => handleRowContextMenu(e, track)}
                            >
                              <span style={{ ...styles.col, ...styles.colArtist }} title={artist}>{artist}</span>
                              <span style={{ ...styles.col, ...styles.colAlbum }} title={album}>{album}</span>
                              <span style={{ ...styles.col, ...styles.colTitle }} title={displayTitle}>
                                {isPlaying && <span style={styles.playingDot}>▶ </span>}
                                {displayTitle}
                              </span>
                              <span style={{ ...styles.col, ...styles.colDuration }}>{duration}</span>
                              <span style={styles.colFavorite}>
                                {!track.isStream && (
                                  <button
                                    style={{ ...styles.favBtn, ...(track.favorite ? {} : styles.favBtnInactive) }}
                                    onClick={(e) => handleToggleFavorite(e, track)}
                                    title={track.favorite ? 'Remove from favorites' : 'Add to favorites'}
                                  >
                                    <Heart
                                      set={track.favorite ? 'bold' : 'light'}
                                      size={13}
                                      primaryColor={track.favorite ? 'var(--accent)' : 'currentColor'}
                                    />
                                  </button>
                                )}
                              </span>
                            </div>
                          )
                        })}
                        {isCollapsed && group.tracks.length > 1 && (
                          <div style={styles.collapsedHint}>
                            +{group.tracks.length - 1} tracks
                          </div>
                        )}
                      </div>
                      <div style={styles.artCell}>
                        {group.coverDataUrl ? (
                          <img src={group.coverDataUrl} alt="" style={styles.artImg} />
                        ) : (
                          <div style={styles.artPlaceholder} />
                        )}
                      </div>
                      <div style={styles.controlsCell}>
                        <span style={styles.groupNum}>{groupIndex + 1}</span>
                        <button
                          style={{ ...styles.ctrlBtn, ...(!canReorderGroups || groupIndex === 0 ? styles.ctrlBtnDim : {}) }}
                          disabled={!canReorderGroups || groupIndex === 0}
                          onClick={(e) => { e.stopPropagation(); onMoveGroup(groupIndex, 'up') }}
                          title={canReorderGroups ? 'Move up' : 'Clear search/favorites filter to reorder'}
                        ><ArrowUp set="light" size={12} primaryColor="currentColor" /></button>
                        {group.tracks.length > 1 && (
                          <button
                            style={styles.ctrlBtn}
                            onClick={(e) => { e.stopPropagation(); toggleCollapse(group.key) }}
                            title={isCollapsed ? 'Expand' : 'Collapse'}
                          >
                            {isCollapsed
                              ? <ChevronRight set="light" size={12} primaryColor="currentColor" />
                              : <ChevronDown set="light" size={12} primaryColor="currentColor" />}
                          </button>
                        )}
                        <button
                          style={{ ...styles.ctrlBtn, ...(!canReorderGroups || groupIndex === groups.length - 1 ? styles.ctrlBtnDim : {}) }}
                          disabled={!canReorderGroups || groupIndex === groups.length - 1}
                          onClick={(e) => { e.stopPropagation(); onMoveGroup(groupIndex, 'down') }}
                          title={canReorderGroups ? 'Move down' : 'Clear search/favorites filter to reorder'}
                        ><ArrowDown set="light" size={12} primaryColor="currentColor" /></button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {contextMenu && (
        <div
          style={{ ...styles.ctxMenu, left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {tracks.some((t) => selectedIds.has(t.id) && !t.isStream) && (
            <button style={styles.ctxItem} onClick={handleEditTags}>
              <Edit set="light" size={13} primaryColor="currentColor" />
              Edit Tags{selectedIds.size > 1 ? ` (${[...selectedIds].filter(id => tracks.find(t => t.id === id && !t.isStream)).length} tracks)` : ''}
            </button>
          )}
          {tracks.filter((t) => selectedIds.has(t.id) && !t.isStream).length > 1 && (
            <button style={styles.ctxItem} onClick={handleSetAlbum}>
              <Disc size={13} color="currentColor" />
              Set as Album ({tracks.filter((t) => selectedIds.has(t.id) && !t.isStream).length} tracks)
            </button>
          )}
          {selectedNonStreamTracks.length === 1 && (
            <button style={styles.ctxItem} onClick={handleShowInFolder}>
              <Folder set="light" size={13} primaryColor="currentColor" />
              Show in Folder
            </button>
          )}
          {selectedNonStreamTracks.length >= 1 && (
            <button style={styles.ctxItem} onClick={handleCopyPath}>
              <Document set="light" size={13} primaryColor="currentColor" />
              Copy File Path{selectedNonStreamTracks.length > 1 ? ` (${selectedNonStreamTracks.length})` : ''}
            </button>
          )}
          {convertibleCount > 0 && (
            <button style={styles.ctxItem} onClick={handleConvertClick}>
              <PaperDownload set="light" size={13} primaryColor="currentColor" />
              Convert to MP3{convertibleCount > 1 ? ` (${convertibleCount})` : ''}
            </button>
          )}
          {otherPlaylists.length > 0 && selectedIds.size >= 1 && (
            <>
              <div style={styles.ctxDivider} />
              <button style={styles.ctxItem} onClick={() => setMoveSubmenu(moveSubmenu === 'move' ? null : 'move')}>
                <Swap set="light" size={13} primaryColor="currentColor" />
                Move to Playlist
                <span style={styles.ctxArrow}>{moveSubmenu === 'move' ? '▾' : '▸'}</span>
              </button>
              {moveSubmenu === 'move' && otherPlaylists.map((pl) => (
                <button key={pl.id} style={styles.ctxSubItem} onClick={() => handleMoveOrCopyClick(pl.id, 'move')}>
                  {pl.name}
                </button>
              ))}
              <button style={styles.ctxItem} onClick={() => setMoveSubmenu(moveSubmenu === 'copy' ? null : 'copy')}>
                <Send set="light" size={13} primaryColor="currentColor" />
                Copy to Playlist
                <span style={styles.ctxArrow}>{moveSubmenu === 'copy' ? '▾' : '▸'}</span>
              </button>
              {moveSubmenu === 'copy' && otherPlaylists.map((pl) => (
                <button key={pl.id} style={styles.ctxSubItem} onClick={() => handleMoveOrCopyClick(pl.id, 'copy')}>
                  {pl.name}
                </button>
              ))}
              <div style={styles.ctxDivider} />
            </>
          )}
          <button style={{ ...styles.ctxItem, ...styles.ctxItemDanger }} onClick={handleRemoveSelected}>
            <Delete set="light" size={13} primaryColor="currentColor" />
            Remove from Playlist
          </button>
        </div>
      )}

      {tagEditorTracks && (
        <TagEditorModal
          tracks={tagEditorTracks}
          onSave={handleTagSave}
          onClose={() => setTagEditorTracks(null)}
        />
      )}
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
    backgroundImage: `url(${brushedMetalUrl})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    borderBottom: '1px solid var(--border)',
    flexShrink: 0,
    position: 'relative' as const,
  },
  title: {
    fontFamily: "'Michroma', var(--font)",
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: '0.02em',
    color: 'var(--accent)',
    textShadow: 'var(--accent-glow)',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  searchBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    background: 'var(--bg-hover)',
    border: '1px solid var(--border-bright)',
    borderRadius: 4,
    height: 22,
    padding: '0 7px',
  },
  searchIcon: {
    display: 'flex',
    alignItems: 'center',
    opacity: 0.6,
  },
  searchInput: {
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--text-primary)',
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    width: 130,
  },
  searchClear: {
    background: 'transparent',
    border: 'none',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    fontSize: 13,
    lineHeight: 1,
    padding: 0,
  },
  favFilterBtn: {
    background: 'var(--bg-hover)',
    border: '1px solid var(--border-bright)',
    color: 'var(--text-secondary)',
    height: 22,
    width: 22,
    borderRadius: 4,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  favFilterBtnActive: {
    color: 'var(--accent)',
    borderColor: 'var(--accent)',
  },
  btnGroup: {
    display: 'flex',
    gap: 4,
  },
  addBtn: {
    background: 'var(--bg-hover)',
    border: '1px solid var(--border-bright)',
    color: 'var(--text-secondary)',
    height: 22,
    padding: '0 7px',
    borderRadius: 4,
    cursor: 'pointer',
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    transition: 'background 0.1s',
    whiteSpace: 'nowrap' as const,
  },
  addPlus: {
    display: 'inline-flex',
    alignItems: 'center',
    color: 'var(--accent)',
  },
  tabBar: {
    display: 'flex',
    alignItems: 'stretch',
    borderBottom: '1px solid var(--border)',
    backgroundImage: `url(${brushedMetalUrl})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
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
  tabDragOver: {
    background: 'var(--accent-dim)',
    borderBottom: '2px solid var(--accent)',
    outline: '1px dashed var(--accent)',
    outlineOffset: -2,
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
    color: 'var(--accent-secondary)',
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
    color: 'var(--accent-secondary)',
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
    paddingTop: 40,
    flex: 1,
    background: 'var(--bg-content)',
    color: 'var(--content-text-secondary)',
    fontSize: 12,
  },
  emptyIcon: {
    opacity: 0.3,
  },
  emptyHint: {
    fontSize: 11,
    color: 'var(--content-text-secondary)',
  },
  list: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    minHeight: 0,
    background: 'var(--bg-content)',
  },
  listDragOver: {
    outline: '2px dashed var(--accent)',
    outlineOffset: -2,
    background: 'var(--accent-dim)',
  },
  colHeader: {
    display: 'flex',
    alignItems: 'center',
    height: 26,
    paddingLeft: 12,
    borderBottom: '1px solid var(--content-border)',
    flexShrink: 0,
    background: 'var(--bg-content-alt)',
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
    color: 'var(--content-text-secondary)',
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
    borderBottom: '1px solid var(--content-border)',
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
    background: 'var(--bg-content-alt)',
    borderLeftColor: 'var(--accent)',
  },
  rowSelected: {
    background: 'var(--content-border)',
    borderLeftColor: 'var(--border-bright)',
  },
  rowMultiSelected: {
    background: 'var(--accent-row-tint)',
    borderLeftColor: 'var(--accent)',
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
    border: '1px solid var(--content-border)',
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
    color: 'var(--content-text-secondary)',
  },
  colAlbum: {
    width: '22%',
    flexShrink: 0,
    color: 'var(--content-text-secondary)',
  },
  colTitle: {
    flex: 1,
    color: 'var(--content-text-secondary)',
    minWidth: 0,
  },
  colDuration: {
    width: 40,
    flexShrink: 0,
    textAlign: 'right',
    paddingRight: 0,
    color: 'var(--content-text-secondary)',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
  },
  colFavorite: {
    width: 22,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  favBtn: {
    background: 'transparent',
    border: 'none',
    padding: 0,
    cursor: 'pointer',
    color: 'var(--text-secondary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  favBtnInactive: {
    opacity: 0.35,
  },
  playingDot: {
    color: 'var(--accent)',
    fontSize: 9,
    textShadow: 'var(--accent-glow)',
  },
  controlsCell: {
    width: CTRL_COL,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    padding: '4px 0',
  },
  ctrlBtn: {
    background: 'transparent',
    border: 'none',
    color: 'var(--accent)',
    cursor: 'pointer',
    fontSize: 11,
    width: 22,
    height: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
    padding: 0,
    opacity: 0.8,
    lineHeight: 1,
  },
  ctrlBtnDim: {
    opacity: 0.2,
    cursor: 'default',
  },
  groupNum: {
    fontSize: 9,
    color: 'var(--accent)',
    fontFamily: 'var(--font-mono)',
    opacity: 0.5,
    lineHeight: 1,
    marginBottom: 1,
  },
  ctxMenu: {
    position: 'fixed' as const,
    background: 'var(--bg-panel)',
    border: '1px solid var(--border-bright)',
    borderRadius: 6,
    boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
    zIndex: 500,
    minWidth: 180,
    padding: '4px 0',
    overflow: 'hidden',
  },
  ctxItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    background: 'transparent',
    border: 'none',
    color: 'var(--text-primary)',
    fontSize: 12,
    fontFamily: 'var(--font)',
    padding: '7px 14px',
    textAlign: 'left' as const,
    cursor: 'pointer',
    transition: 'background 0.08s',
  },
  ctxItemDanger: {
    color: 'var(--danger)',
  },
  ctxArrow: {
    marginLeft: 'auto',
    fontSize: 10,
    color: 'var(--text-secondary)',
  },
  ctxSubItem: {
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    background: 'transparent',
    border: 'none',
    color: 'var(--text-secondary)',
    fontSize: 12,
    fontFamily: 'var(--font)',
    padding: '6px 14px 6px 30px',
    textAlign: 'left' as const,
    cursor: 'pointer',
    transition: 'background 0.08s',
  },
  ctxDivider: {
    height: 1,
    background: 'var(--border)',
    margin: '4px 0',
  },
  collapsedHint: {
    height: 18,
    paddingLeft: 12,
    fontSize: 10,
    color: 'var(--content-text-secondary)',
    opacity: 0.5,
    fontFamily: 'var(--font-mono)',
    display: 'flex',
    alignItems: 'center',
  },
}
