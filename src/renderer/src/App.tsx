import { useState, useCallback, useEffect, useRef } from 'react'
import Sidebar from './components/Sidebar'
import Transport from './components/Transport'
import LoopEditorPanel from './components/LoopEditorPanel'
import ConvertPromptModal from './components/ConvertPromptModal'
import type { Track, Playlist, PlayerState } from './types'
import brushedMetalUrl from './assets/textures/brushed-metal.jpg'

async function buildTracks(api: any, paths: string[]): Promise<Track[]> {
  const metaList: Array<{
    path: string; title: string | null; artist: string | null
    album: string | null; trackNumber: number | null; duration: number | null; coverDataUrl: string | null
    year: string | null; genre: string | null
  }> = await api.readMetadata(paths)
  const metaMap = new Map(metaList.map((m) => [m.path, m]))
  return paths.map((filePath) => {
    const m = metaMap.get(filePath)
    return {
      id: crypto.randomUUID(),
      path: filePath,
      name: filePath.split(/[\\/]/).pop() ?? filePath,
      title: m?.title ?? undefined,
      artist: m?.artist ?? undefined,
      album: m?.album ?? undefined,
      trackNumber: m?.trackNumber ?? undefined,
      duration: m?.duration ?? undefined,
      coverDataUrl: m?.coverDataUrl ?? undefined,
      year: m?.year ?? undefined,
      genre: m?.genre ?? undefined,
    }
  })
}

const INITIAL_ID = crypto.randomUUID()

// Sorts alphabetically by album, then by artist within that album, then by track
// number — so whole albums move together instead of interleaving tracks from the
// same artist. Sorting by album first (rather than artist first) keeps compilation
// albums (same album tag, different artist per track, e.g. "Various Artists" discs)
// grouped as one album instead of scattering their tracks across the artist-sorted
// list. Missing artist/album sort after everything else rather than clumping at the
// front like an empty string would.
function sortByArtist(tracks: Track[]): Track[] {
  const norm = (s: string | undefined) => (s?.trim() ? s.trim() : '￿')
  return [...tracks].sort((a, b) => {
    const albumCmp = norm(a.album).localeCompare(norm(b.album), undefined, { sensitivity: 'base' })
    if (albumCmp !== 0) return albumCmp
    const artistCmp = norm(a.artist).localeCompare(norm(b.artist), undefined, { sensitivity: 'base' })
    if (artistCmp !== 0) return artistCmp
    const trackA = a.trackNumber ?? Number.MAX_SAFE_INTEGER
    const trackB = b.trackNumber ?? Number.MAX_SAFE_INTEGER
    if (trackA !== trackB) return trackA - trackB
    return (a.title ?? a.name).localeCompare(b.title ?? b.name, undefined, { sensitivity: 'base' })
  })
}

function reorderGroups(tracks: Track[], groupIndex: number, direction: 'up' | 'down'): Track[] {
  const groups: Track[][] = []
  for (const track of tracks) {
    const album = track.album ?? null
    const last = groups[groups.length - 1]
    if (last && album !== null && (last[0].album ?? null) === album) {
      last.push(track)
    } else {
      groups.push([track])
    }
  }
  const target = direction === 'up' ? groupIndex - 1 : groupIndex + 1
  if (target < 0 || target >= groups.length) return tracks
  ;[groups[groupIndex], groups[target]] = [groups[target], groups[groupIndex]]
  return groups.flat()
}

export default function App() {
  const [playlists, setPlaylists] = useState<Playlist[]>([
    { id: INITIAL_ID, name: 'Playlist 1', tracks: [], isDefaultName: true },
  ])
  const [activePlaylistId, setActivePlaylistId] = useState<string>(INITIAL_ID)
  const [activeTrack, setActiveTrack] = useState<Track | null>(null)
  const [selectedTrack, setSelectedTrack] = useState<Track | null>(null)
  const [radioActive, setRadioActive] = useState(false)
  const [player, setPlayer] = useState<PlayerState>({
    playing: false,
    currentTime: 0,
    duration: 0,
    volume: 0.8,
    speed: 1.0,
    loopEnabled: false,
    loopStart: null,
    loopEnd: null,
    seekTo: null,
    playMode: 'sequence',
  })

  const hasLoaded = useRef(false)
  const activeTrackRef = useRef<Track | null>(null)
  const activePlaylistRef = useRef<{ id: string; name: string; tracks: Track[] } | null>(null)
  const playerRef = useRef(player)
  const playlistsRef = useRef(playlists)

  const activePlaylist = playlists.find((p) => p.id === activePlaylistId) ?? playlists[0]

  activeTrackRef.current = activeTrack
  activePlaylistRef.current = activePlaylist
  playerRef.current = player
  playlistsRef.current = playlists

  const importPaths = useCallback(async (paths: string[], targetPlaylistId?: string) => {
    if (!paths.length) return
    const api = (window as any).electronAPI
    const newTracks: Track[] = api
      ? await buildTracks(api, paths)
      : paths.map((filePath) => ({
          id: crypto.randomUUID(),
          path: filePath,
          name: filePath.split(/[\\/]/).pop() ?? filePath,
        }))
    const destId = targetPlaylistId ?? activePlaylistId
    setPlaylists((prev) =>
      prev.map((p) => {
        if (p.id !== destId) return p
        const existing = new Set(p.tracks.map((t) => t.path))
        return { ...p, tracks: sortByArtist([...p.tracks, ...newTracks.filter((t) => !existing.has(t.path))]) }
      })
    )
  }, [activePlaylistId])

  // Lossless imports (FLAC/WAV) get routed through a convert-to-MP3 prompt instead
  // of being added directly — see pendingConvert state + ConvertPromptModal below.
  // A lossless file with a companion .cue sheet (a whole album ripped as one file)
  // gets split into individually-tagged tracks rather than converted 1:1.
  type CueInfo = Record<string, { trackCount: number; albumTitle?: string } | null>
  type PendingConvertRequest = { paths: string[]; targetPlaylistId?: string; lossless: string[]; cueInfo: CueInfo }
  const [pendingConvert, setPendingConvert] = useState<PendingConvertRequest | null>(null)
  // addPaths can be called for several playlists back-to-back (e.g. "Update Folders"
  // rescanning every playlist's source folders in one pass) without waiting for the
  // user to resolve the previous convert prompt. Since pendingConvert is a single
  // slot, a second call would otherwise clobber the first before it's even shown —
  // queue the rest and reveal them one at a time as each prompt is resolved.
  const pendingConvertActiveRef = useRef(false)
  const pendingConvertQueueRef = useRef<PendingConvertRequest[]>([])

  const advancePendingConvertQueue = useCallback(() => {
    const next = pendingConvertQueueRef.current.shift()
    if (next) {
      setPendingConvert(next)
    } else {
      pendingConvertActiveRef.current = false
      setPendingConvert(null)
    }
  }, [])
  const [converting, setConverting] = useState(false)
  const [convertProgress, setConvertProgress] = useState<{ done: number; total: number; file: string } | null>(null)
  const [ffmpegAvailable, setFfmpegAvailable] = useState<boolean | null>(null)
  const ffmpegCheckedRef = useRef(false)

  // Context-menu "Convert to MP3" on already-imported tracks: unlike pendingConvert
  // above (which adds newly-imported files), this replaces the existing playlist
  // entries in place with the freshly converted MP3s.
  const [pendingConvertSelected, setPendingConvertSelected] = useState<{ trackIds: string[]; playlistId: string; paths: string[] } | null>(null)

  const LOSSLESS_EXTS = new Set(['.flac', '.wav'])
  const getExt = (p: string) => {
    const i = p.lastIndexOf('.')
    return i === -1 ? '' : p.slice(i).toLowerCase()
  }

  const addPaths = useCallback(async (paths: string[], targetPlaylistId?: string) => {
    // Re-adding a folder that's already in the playlist must not re-prompt for its
    // lossless files — converting them would add the MP3 next to the existing entry.
    // Tracks already listed are converted via the context menu instead.
    const destId = targetPlaylistId ?? activePlaylistId
    const existing = new Set(playlistsRef.current.find((p) => p.id === destId)?.tracks.map((t) => t.path) ?? [])
    paths = paths.filter((p) => !existing.has(p))
    if (!paths.length) return
    const api = (window as any).electronAPI
    const lossless = api ? paths.filter((p) => LOSSLESS_EXTS.has(getExt(p))) : []
    if (lossless.length > 0) {
      if (!ffmpegCheckedRef.current) {
        ffmpegCheckedRef.current = true
        api.checkFfmpeg().then(setFfmpegAvailable)
      }
      const cueInfo: CueInfo = await api.getCueInfo(lossless)
      const request: PendingConvertRequest = { paths, targetPlaylistId, lossless, cueInfo }
      if (pendingConvertActiveRef.current) {
        pendingConvertQueueRef.current.push(request)
      } else {
        pendingConvertActiveRef.current = true
        setPendingConvert(request)
      }
      return
    }
    importPaths(paths, targetPlaylistId)
  }, [importPaths, activePlaylistId])

  const handleConvertToMp3 = useCallback(async (deleteOriginal: boolean) => {
    if (!pendingConvert) return
    const api = (window as any).electronAPI
    const { paths, targetPlaylistId, lossless, cueInfo } = pendingConvert
    const totalUnits = lossless.reduce((sum, p) => sum + (cueInfo[p]?.trackCount ?? 1), 0)
    setConverting(true)
    setConvertProgress({ done: 0, total: totalUnits, file: '' })
    const offProgress = api.onConvertProgress((p: { done: number; total: number; file: string }) => setConvertProgress(p))
    try {
      const results: Array<{ originalPath: string; mp3Paths: string[]; success: boolean; error?: string }> =
        await api.convertToMp3(lossless, { deleteOriginal })
      const replacement = new Map(
        results.filter((r) => r.success && r.mp3Paths.length).map((r) => [r.originalPath, r.mp3Paths])
      )
      const finalPaths = paths.flatMap((p) => replacement.get(p) ?? [p])
      importPaths(finalPaths, targetPlaylistId)
      if (deleteOriginal) {
        // Originals that converted cleanly are gone from disk now. Any playlist still
        // listing one (another playlist sharing the folder, say) would keep a dead,
        // 0-second entry — swap it for the MP3s there too.
        const deleted = new Map(
          results.filter((r) => r.success && !r.error && r.mp3Paths.length).map((r) => [r.originalPath, r.mp3Paths])
        )
        const holders = playlistsRef.current
          .map((p) => ({ id: p.id, mp3s: p.tracks.filter((t) => deleted.has(t.path)).flatMap((t) => deleted.get(t.path)!) }))
          .filter((h) => h.mp3s.length)
        if (holders.length) {
          setPlaylists((prev) => prev.map((p) => ({ ...p, tracks: p.tracks.filter((t) => !deleted.has(t.path)) })))
          setActiveTrack((prev) => (prev && deleted.has(prev.path) ? null : prev))
          setSelectedTrack((prev) => (prev && deleted.has(prev.path) ? null : prev))
          for (const h of holders) importPaths(h.mp3s, h.id)
        }
      }
      const failed = results.filter((r) => r.error)
      if (failed.length) {
        alert(
          `Some tracks did not convert cleanly and were kept in their original format:\n` +
          failed.map((r) => `${r.originalPath.split(/[\\/]/).pop()}: ${r.error}`).join('\n')
        )
      }
    } finally {
      offProgress?.()
      setConverting(false)
      setConvertProgress(null)
      advancePendingConvertQueue()
    }
  }, [pendingConvert, importPaths, advancePendingConvertQueue])

  const handleKeepOriginalFormat = useCallback(() => {
    if (!pendingConvert) return
    importPaths(pendingConvert.paths, pendingConvert.targetPlaylistId)
    advancePendingConvertQueue()
  }, [pendingConvert, importPaths, advancePendingConvertQueue])

  const handleCancelConvert = useCallback(() => {
    advancePendingConvertQueue()
  }, [advancePendingConvertQueue])

  const handleCancelConverting = useCallback(() => {
    const api = (window as any).electronAPI
    api?.cancelConvert?.()
  }, [])

  const handleConvertSelected = useCallback((trackIds: string[]) => {
    const api = (window as any).electronAPI
    if (!api) return
    const playlist = playlistsRef.current.find((p) => p.id === activePlaylistId)
    if (!playlist) return
    const idSet = new Set(trackIds)
    const eligible = playlist.tracks.filter((t) => idSet.has(t.id) && !t.isStream && getExt(t.path) !== '.mp3')
    if (!eligible.length) return
    if (!ffmpegCheckedRef.current) {
      ffmpegCheckedRef.current = true
      api.checkFfmpeg().then(setFfmpegAvailable)
    }
    setPendingConvertSelected({
      trackIds: eligible.map((t) => t.id),
      playlistId: activePlaylistId,
      paths: eligible.map((t) => t.path),
    })
  }, [activePlaylistId])

  const handleConfirmConvertSelected = useCallback(async (deleteOriginal: boolean) => {
    if (!pendingConvertSelected) return
    const api = (window as any).electronAPI
    const { trackIds, playlistId, paths } = pendingConvertSelected
    setConverting(true)
    setConvertProgress({ done: 0, total: paths.length, file: '' })
    const offProgress = api.onConvertProgress((p: { done: number; total: number; file: string }) => setConvertProgress(p))
    try {
      const results: Array<{ originalPath: string; mp3Paths: string[]; success: boolean; error?: string }> =
        await api.convertToMp3(paths, { deleteOriginal })
      const replacement = new Map(
        results.filter((r) => r.success && r.mp3Paths.length).map((r) => [r.originalPath, r.mp3Paths])
      )
      // Only drop the tracks that actually converted — a failed conversion must leave
      // the original track in place, same as the import-time convert flow does.
      const convertedIdSet = new Set(
        trackIds.filter((_, i) => replacement.has(paths[i]))
      )
      const newPaths = paths.flatMap((p) => replacement.get(p) ?? [])
      const newTracks = newPaths.length ? await buildTracks(api, newPaths) : []
      setPlaylists((prev) =>
        prev.map((p) => {
          if (p.id !== playlistId) return p
          const kept = p.tracks.filter((t) => !convertedIdSet.has(t.id))
          return { ...p, tracks: sortByArtist([...kept, ...newTracks]) }
        })
      )
      setActiveTrack((prev) => (prev && convertedIdSet.has(prev.id) ? null : prev))
      setSelectedTrack((prev) => (prev && convertedIdSet.has(prev.id) ? null : prev))
      const failed = results.filter((r) => r.error)
      if (failed.length) {
        alert(
          `Some tracks did not convert cleanly and were left unchanged:\n` +
          failed.map((r) => `${r.originalPath.split(/[\\/]/).pop()}: ${r.error}`).join('\n')
        )
      }
    } finally {
      offProgress?.()
      setConverting(false)
      setConvertProgress(null)
      setPendingConvertSelected(null)
    }
  }, [pendingConvertSelected])

  const handleCancelConvertSelected = useCallback(() => {
    setPendingConvertSelected(null)
  }, [])

  const handleMoveToPlaylist = useCallback((trackIds: string[], destPlaylistId: string, mode: 'move' | 'copy') => {
    const idSet = new Set(trackIds)
    setPlaylists((prev) => {
      const source = prev.find((p) => p.id === activePlaylistId)
      if (!source) return prev
      const selected = source.tracks.filter((t) => idSet.has(t.id))
      if (!selected.length) return prev
      return prev.map((p) => {
        if (p.id === destPlaylistId) {
          const existingPaths = new Set(p.tracks.filter((t) => !t.isStream).map((t) => t.path))
          const toAdd = selected
            .filter((t) => t.isStream || !existingPaths.has(t.path))
            .map((t) => (mode === 'copy' ? { ...t, id: crypto.randomUUID() } : t))
          return { ...p, tracks: sortByArtist([...p.tracks, ...toAdd]) }
        }
        if (p.id === activePlaylistId && mode === 'move') {
          return { ...p, tracks: p.tracks.filter((t) => !idSet.has(t.id)) }
        }
        return p
      })
    })
    if (mode === 'move') {
      setActiveTrack((prev) => (prev && idSet.has(prev.id) ? null : prev))
      setSelectedTrack((prev) => (prev && idSet.has(prev.id) ? null : prev))
    }
  }, [activePlaylistId])

  const handleDropToPlaylist = useCallback(async (playlistId: string, droppedPaths: string[]) => {
    const api = (window as any).electronAPI
    const paths: string[] = api ? await api.scanPaths(droppedPaths) : droppedPaths
    addPaths(paths, playlistId)
  }, [addPaths])

  const handleAddFiles = useCallback(async () => {
    const api = (window as any).electronAPI
    if (!api) return
    const paths: string[] = await api.openFiles()
    addPaths(paths)
  }, [addPaths])

  const handleAddFolder = useCallback(async () => {
    const api = (window as any).electronAPI
    if (!api) return
    const { folders, files }: { folders: string[]; files: string[] } = await api.openFolder()
    if (folders.length) {
      const destId = activePlaylistId
      setPlaylists((prev) =>
        prev.map((p) => {
          if (p.id !== destId) return p
          const existing = new Set(p.sourceFolders ?? [])
          const merged = [...(p.sourceFolders ?? []), ...folders.filter((f) => !existing.has(f))]
          return { ...p, sourceFolders: merged }
        })
      )
    }
    addPaths(files)
  }, [addPaths, activePlaylistId])

  // Re-scans every folder ever added (via "Add Folder") to each playlist and imports
  // any files that showed up on disk since — a manual alternative to the old Live
  // Folder watcher. New lossless files still go through the usual convert-to-MP3 prompt.
  const handleUpdateFolders = useCallback(async () => {
    const api = (window as any).electronAPI
    if (!api) return
    for (const playlist of playlistsRef.current) {
      const folders = playlist.sourceFolders
      if (!folders?.length) continue
      const found: string[] = await api.scanPaths(folders)
      const existing = new Set(playlist.tracks.filter((t) => !t.isStream).map((t) => t.path))
      const newPaths = found.filter((p) => !existing.has(p))
      if (newPaths.length) addPaths(newPaths, playlist.id)
    }
  }, [addPaths])

  const handleRemoveMissing = useCallback(async () => {
    const api = (window as any).electronAPI
    if (!api?.findMissingTracks) return
    const request = playlistsRef.current.map((p) => ({
      name: p.name,
      paths: p.tracks.filter((t) => !t.isStream).map((t) => t.path),
    }))
    const missing = new Set<string>(await api.findMissingTracks(request))
    if (!missing.size) return
    setPlaylists((prev) => prev.map((p) => ({ ...p, tracks: p.tracks.filter((t) => t.isStream || !missing.has(t.path)) })))
    setActiveTrack((prev) => (prev && !prev.isStream && missing.has(prev.path) ? null : prev))
    setSelectedTrack((prev) => (prev && !prev.isStream && missing.has(prev.path) ? null : prev))
  }, [])

  const handleAddPlaylist = useCallback(() => {
    const newId = crypto.randomUUID()
    setPlaylists((prev) => [
      ...prev,
      { id: newId, name: `Playlist ${prev.length + 1}`, tracks: [], isDefaultName: true },
    ])
    setActivePlaylistId(newId)
  }, [])

  const handleSelectPlaylist = useCallback((id: string) => {
    setActivePlaylistId(id)
  }, [])

  const handleRemovePlaylist = useCallback((id: string) => {
    setPlaylists((prev) => {
      if (prev.length <= 1) return prev
      const next = prev
        .filter((p) => p.id !== id)
        .map((p, i) => (p.isDefaultName ? { ...p, name: `Playlist ${i + 1}` } : p))
      setActivePlaylistId((cur) => (cur === id ? next[0].id : cur))
      return next
    })
  }, [])

  const handleRenamePlaylist = useCallback((id: string, name: string) => {
    setPlaylists((prev) => prev.map((p) => (p.id === id ? { ...p, name, isDefaultName: false } : p)))
  }, [])

  // Load saved library on startup
  useEffect(() => {
    const api = (window as any).electronAPI
    if (!api) {
      hasLoaded.current = true
      return
    }
    api.loadLibrary().then(async (saved: any) => {
      if (saved?.playlists?.length) {
        const loaded: Playlist[] = await Promise.all(
          saved.playlists.map(async (sp: any) => {
            const fileTracks = sp.paths?.length ? await buildTracks(api, sp.paths) : []
            const streamTracks: Track[] = (sp.streams ?? []).map((s: any) => ({
              id: crypto.randomUUID(),
              path: s.url,
              name: s.name,
              isStream: true,
            }))
            const favoriteSet = new Set<string>(sp.favorites ?? [])
            const favoritedFileTracks = fileTracks.map((t) => (favoriteSet.has(t.path) ? { ...t, favorite: true } : t))
            return {
              id: sp.id,
              name: sp.name,
              tracks: sortByArtist([...favoritedFileTracks, ...streamTracks]),
              sourceFolders: sp.sourceFolders,
            }
          })
        )
        setPlaylists(loaded)
        const activeExists = loaded.find((p) => p.id === saved.activePlaylistId)
        setActivePlaylistId(activeExists ? saved.activePlaylistId : loaded[0].id)
      }
      hasLoaded.current = true
    })
  }, [])

  // Persist library whenever state changes (skip before initial load completes)
  useEffect(() => {
    if (!hasLoaded.current) return
    const api = (window as any).electronAPI
    if (!api) return
    api.saveLibrary({
      playlists: playlists.map((p) => ({
        id: p.id,
        name: p.name,
        paths: p.tracks.filter((t) => !t.isStream).map((t) => t.path),
        streams: p.tracks.filter((t) => t.isStream).map((t) => ({ url: t.path, name: t.name })),
        sourceFolders: p.sourceFolders,
        favorites: p.tracks.filter((t) => !t.isStream && t.favorite).map((t) => t.path),
      })),
      activePlaylistId,
    })
  }, [playlists, activePlaylistId])

  const handlePlayTrack = useCallback((track: Track) => {
    setSelectedTrack(track)
    setActiveTrack(track)
    setPlayer((p) => ({
      ...p,
      playing: true,
      currentTime: 0,
      duration: 0,
      loopEnabled: false,
      loopStart: null,
      loopEnd: null,
      seekTo: null,
    }))
  }, [])

  // Shared by the Space-bar shortcut and the Playback menu's "Play/Pause" item,
  // so both behave identically (load+play the selected track if nothing's loaded yet).
  const togglePlayPause = useCallback(() => {
    if (!activeTrack && selectedTrack) {
      handlePlayTrack(selectedTrack)
      return
    }
    setPlayer((p) => {
      if (p.playing) return { ...p, playing: false }
      if (p.loopEnabled && p.loopStart !== null) {
        return { ...p, playing: true, seekTo: p.loopStart, currentTime: p.loopStart }
      }
      return { ...p, playing: true }
    })
  }, [activeTrack, selectedTrack, handlePlayTrack])

  // Keyboard navigation
  useEffect(() => {
    if (!activeTrack && !selectedTrack) return
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (e.code === 'Space') {
        e.preventDefault()
        togglePlayPause()
        return
      }

      if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
        e.preventDefault()
        if (!activeTrack) return
        setPlaylists((prev) => {
          const playlist = prev.find((p) => p.id === activePlaylistId)
          if (!playlist) return prev
          const idx = playlist.tracks.findIndex((t) => t.id === activeTrack.id)
          if (idx === -1) return prev
          const nextIdx = e.code === 'ArrowDown'
            ? Math.min(idx + 1, playlist.tracks.length - 1)
            : Math.max(idx - 1, 0)
          const next = playlist.tracks[nextIdx]
          if (next && next.id !== activeTrack.id) {
            setActiveTrack(next)
            setPlayer((p) => ({ ...p, playing: false, currentTime: 0, duration: 0, loopEnabled: false, loopStart: null, loopEnd: null, seekTo: null }))
          }
          return prev
        })
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeTrack, selectedTrack, activePlaylistId, togglePlayPause])

  // Native menu items (File/Playback) mirror the in-app buttons and shortcuts.
  const toggleLoopFromMenu = useCallback(() => {
    setPlayer((p) => {
      if (p.loopEnabled) return { ...p, loopEnabled: false }
      if (p.loopStart !== null && p.loopEnd !== null) return { ...p, loopEnabled: true }
      if (!p.duration) return p
      return { ...p, loopEnabled: true, loopStart: 0, loopEnd: p.duration }
    })
  }, [])

  useEffect(() => {
    const api = (window as any).electronAPI
    if (!api?.onMenuAction) return
    const offs = [
      api.onMenuAction('menu:add-files', handleAddFiles),
      api.onMenuAction('menu:add-folder', handleAddFolder),
      api.onMenuAction('menu:update-folders', handleUpdateFolders),
      api.onMenuAction('menu:remove-missing', handleRemoveMissing),
      api.onMenuAction('menu:new-playlist', handleAddPlaylist),
      api.onMenuAction('menu:toggle-play', togglePlayPause),
      api.onMenuAction('menu:toggle-loop', toggleLoopFromMenu),
    ]
    return () => offs.forEach((off) => off?.())
  }, [handleAddFiles, handleAddFolder, handleUpdateFolders, handleRemoveMissing, handleAddPlaylist, togglePlayPause, toggleLoopFromMenu])

  const handleTrackFinish = useCallback(() => {
    const track = activeTrackRef.current
    const playlist = activePlaylistRef.current
    const mode = playerRef.current.playMode

    if (mode === 'repeat-one') {
      setPlayer((p) => ({ ...p, playing: true, seekTo: 0, currentTime: 0 }))
      return
    }

    if (!track || !playlist?.tracks.length) {
      setPlayer((p) => ({ ...p, playing: false }))
      return
    }

    let next: Track | null = null

    if (mode === 'shuffle') {
      const others = playlist.tracks.filter((t) => t.id !== track.id)
      if (!others.length) { setPlayer((p) => ({ ...p, playing: false })); return }
      next = others[Math.floor(Math.random() * others.length)]
    } else {
      const idx = playlist.tracks.findIndex((t) => t.id === track.id)
      if (idx === -1 || idx >= playlist.tracks.length - 1) {
        setPlayer((p) => ({ ...p, playing: false }))
        return
      }
      next = playlist.tracks[idx + 1]
    }

    if (next) {
      setSelectedTrack(next)
      setActiveTrack(next)
      setPlayer((p) => ({
        ...p,
        playing: true,
        currentTime: 0,
        duration: 0,
        loopEnabled: false,
        loopStart: null,
        loopEnd: null,
        seekTo: null,
      }))
    }
  }, [])

  const handleRadioTabChange = useCallback((active: boolean) => {
    setRadioActive(active)
    // audio keeps playing in both directions — stops only when user explicitly plays something else
  }, [])

  const handlePlayStream = useCallback((url: string, name: string) => {
    const track: Track = {
      id: crypto.randomUUID(),
      path: url,
      name,
      isStream: true,
    }
    setSelectedTrack(track)
    setActiveTrack(track)
    setPlayer((p) => ({
      ...p,
      playing: true,
      currentTime: 0,
      duration: 0,
      loopEnabled: false,
      loopStart: null,
      loopEnd: null,
      seekTo: null,
    }))
  }, [])

  const handleSelectTrack = useCallback((track: Track) => {
    setSelectedTrack(track)
  }, [])

  const handleUpdateTracks = useCallback((updatedTracks: Track[]) => {
    setPlaylists((prev) =>
      prev.map((p) => ({
        ...p,
        tracks: p.tracks.map((t) => {
          const u = updatedTracks.find((ut) => ut.id === t.id)
          return u ?? t
        }),
      }))
    )
  }, [])

  const handleRemoveTracks = useCallback((trackIds: string[]) => {
    const idSet = new Set(trackIds)
    setPlaylists((prev) =>
      prev.map((p) =>
        p.id !== activePlaylistId ? p : { ...p, tracks: p.tracks.filter((t) => !idSet.has(t.id)) }
      )
    )
    setActiveTrack((prev) => (prev && idSet.has(prev.id) ? null : prev))
    setSelectedTrack((prev) => (prev && idSet.has(prev.id) ? null : prev))
  }, [activePlaylistId])

  const handleMoveGroup = useCallback((groupIndex: number, direction: 'up' | 'down') => {
    setPlaylists((prev) =>
      prev.map((p) =>
        p.id !== activePlaylistId ? p : { ...p, tracks: reorderGroups(p.tracks, groupIndex, direction) }
      )
    )
  }, [activePlaylistId])


  return (
    <div id="app-shell" style={styles.appShell}>
    <div id="app-root" style={styles.root}>
      <div id="titlebar" style={styles.titleBar} className="titlebar" />

      <div id="playlist-section" style={styles.playlistSection}>
        <Sidebar
          playlists={playlists.map((p) => ({ id: p.id, name: p.name }))}
          activePlaylistId={activePlaylist.id}
          tracks={activePlaylist.tracks}
          activeTrack={activeTrack}
          selectedTrack={selectedTrack}
          onSelectTrack={handleSelectTrack}
          onPlayTrack={handlePlayTrack}
          onAddFiles={handleAddFiles}
          onAddFolder={handleAddFolder}
          onPlayStream={handlePlayStream}
          radioActive={radioActive}
          onRadioTabChange={handleRadioTabChange}
          onSelectPlaylist={handleSelectPlaylist}
          onAddPlaylist={handleAddPlaylist}
          onRemovePlaylist={handleRemovePlaylist}
          onRenamePlaylist={handleRenamePlaylist}
          onMoveGroup={handleMoveGroup}
          onUpdateTracks={handleUpdateTracks}
          onRemoveTracks={handleRemoveTracks}
          onDropToPlaylist={handleDropToPlaylist}
          onConvertSelected={handleConvertSelected}
          onMoveToPlaylist={handleMoveToPlaylist}
        />
      </div>

      <div id="waveform-section" style={styles.waveformSection}>
        <LoopEditorPanel
          track={activeTrack}
          player={player}
          onPlayerChange={setPlayer}
          onFinish={handleTrackFinish}
        />
      </div>

      <Transport
        player={player}
        onPlayerChange={setPlayer}
        isStream={radioActive || (activeTrack?.isStream ?? false)}
      />

      {pendingConvert && (
        <ConvertPromptModal
          losslessPaths={pendingConvert.lossless}
          cueInfo={pendingConvert.cueInfo}
          converting={converting}
          progress={convertProgress}
          ffmpegAvailable={ffmpegAvailable}
          onConvert={handleConvertToMp3}
          onKeepOriginal={handleKeepOriginalFormat}
          onCancel={handleCancelConvert}
          onCancelConverting={handleCancelConverting}
        />
      )}

      {pendingConvertSelected && (
        <ConvertPromptModal
          losslessPaths={pendingConvertSelected.paths}
          cueInfo={{}}
          converting={converting}
          progress={convertProgress}
          ffmpegAvailable={ffmpegAvailable}
          headerTitle="Convert to MP3?"
          promptText={
            `Convert ${pendingConvertSelected.paths.length} file${pendingConvertSelected.paths.length > 1 ? 's' : ''} to MP3? ` +
            'Tags (artist, album, title, cover art) will be preserved. The playlist entry will be replaced with the new MP3.'
          }
          onConvert={handleConfirmConvertSelected}
          onCancel={handleCancelConvertSelected}
          onCancelConverting={handleCancelConverting}
        />
      )}
    </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  appShell: {
    width: '100vw',
    height: '100vh',
    padding: 21,
    boxSizing: 'border-box',
    overflow: 'hidden',
    WebkitAppRegion: 'drag' as any,
  },
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    background: 'var(--bg-base)',
    overflow: 'hidden',
    borderRadius: 6,
    boxShadow: '0 0 0 2px rgba(0,0,0,0.55), 0 8px 24px rgba(0,0,0,0.5)',
    // appShell's drag region cascades to all descendants unless overridden —
    // without this, every button/row/slider in the app becomes part of the
    // draggable titlebar and stops receiving real (non-stationary) clicks.
    WebkitAppRegion: 'no-drag' as any,
  },
  titleBar: {
    height: 28,
    flexShrink: 0,
    backgroundImage: `url(${brushedMetalUrl})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    WebkitAppRegion: 'drag' as any,
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    paddingLeft: 80,
  },
  playlistSection: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  waveformSection: {
    flexShrink: 0,
    height: 200,
    overflow: 'hidden',
  },
}
