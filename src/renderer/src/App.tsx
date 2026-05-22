import { useState, useCallback, useEffect, useRef } from 'react'
import Sidebar from './components/Sidebar'
import Transport from './components/Transport'
import LoopEditorPanel from './components/LoopEditorPanel'
import type { Track, Playlist, PlayerState } from './types'

async function buildTracks(api: any, paths: string[]): Promise<Track[]> {
  const metaList: Array<{
    path: string; title: string | null; artist: string | null
    album: string | null; trackNumber: number | null; duration: number | null; coverDataUrl: string | null
  }> = await api.readMetadata(paths)
  const metaMap = new Map(metaList.map((m) => [m.path, m]))
  return paths.map((filePath) => {
    const m = metaMap.get(filePath)
    return {
      id: crypto.randomUUID(),
      path: filePath,
      name: filePath.split('/').pop() ?? filePath,
      title: m?.title ?? undefined,
      artist: m?.artist ?? undefined,
      album: m?.album ?? undefined,
      trackNumber: m?.trackNumber ?? undefined,
      duration: m?.duration ?? undefined,
      coverDataUrl: m?.coverDataUrl ?? undefined,
    }
  })
}

const INITIAL_ID = crypto.randomUUID()

export default function App() {
  const [playlists, setPlaylists] = useState<Playlist[]>([
    { id: INITIAL_ID, name: 'Playlist 1', tracks: [] },
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

  const activePlaylist = playlists.find((p) => p.id === activePlaylistId) ?? playlists[0]

  activeTrackRef.current = activeTrack
  activePlaylistRef.current = activePlaylist
  playerRef.current = player

  const addPaths = useCallback(async (paths: string[]) => {
    if (!paths.length) return
    const api = (window as any).electronAPI
    const newTracks: Track[] = api
      ? await buildTracks(api, paths)
      : paths.map((filePath) => ({
          id: crypto.randomUUID(),
          path: filePath,
          name: filePath.split('/').pop() ?? filePath,
        }))
    setPlaylists((prev) =>
      prev.map((p) => {
        if (p.id !== activePlaylistId) return p
        const existing = new Set(p.tracks.map((t) => t.path))
        return { ...p, tracks: [...p.tracks, ...newTracks.filter((t) => !existing.has(t.path))] }
      })
    )
  }, [activePlaylistId])

  const handleAddFiles = useCallback(async () => {
    const api = (window as any).electronAPI
    if (!api) return
    const paths: string[] = await api.openFiles()
    addPaths(paths)
  }, [addPaths])

  const handleAddFolder = useCallback(async () => {
    const api = (window as any).electronAPI
    if (!api) return
    const paths: string[] = await api.openFolder()
    addPaths(paths)
  }, [addPaths])

  const handleAddPlaylist = useCallback(() => {
    const newId = crypto.randomUUID()
    setPlaylists((prev) => [
      ...prev,
      { id: newId, name: `Playlist ${prev.length + 1}`, tracks: [] },
    ])
    setActivePlaylistId(newId)
  }, [])

  const handleSelectPlaylist = useCallback((id: string) => {
    setActivePlaylistId(id)
  }, [])

  const handleRemovePlaylist = useCallback((id: string) => {
    setPlaylists((prev) => {
      if (prev.length <= 1) return prev
      const next = prev.filter((p) => p.id !== id)
      setActivePlaylistId((cur) => (cur === id ? next[0].id : cur))
      return next
    })
  }, [])

  const handleRenamePlaylist = useCallback((id: string, name: string) => {
    setPlaylists((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)))
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
            return { id: sp.id, name: sp.name, tracks: [...fileTracks, ...streamTracks] }
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
      })),
      activePlaylistId,
    })
  }, [playlists, activePlaylistId])

  // Keyboard navigation
  useEffect(() => {
    if (!activeTrack && !selectedTrack) return
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if (e.code === 'Space') {
        e.preventDefault()
        if (!activeTrack && selectedTrack) {
          // Track selected but not yet loaded — load and play it
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
  }, [activeTrack, selectedTrack, activePlaylistId])

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
    if (active) {
      // switching to Radio — stop local playback
      if (!activeTrackRef.current?.isStream) {
        setActiveTrack(null)
        setSelectedTrack(null)
        setPlayer((p) => ({ ...p, playing: false, currentTime: 0, duration: 0 }))
      }
    } else {
      // switching back to playlist — stop stream
      if (activeTrackRef.current?.isStream) {
        setActiveTrack(null)
        setSelectedTrack(null)
        setPlayer((p) => ({ ...p, playing: false, currentTime: 0, duration: 0 }))
      }
    }
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

  const handleAddUrl = useCallback((url: string, name: string) => {
    const track: Track = {
      id: crypto.randomUUID(),
      path: url,
      name: name || url,
      isStream: true,
    }
    const newPlaylistId = crypto.randomUUID()
    setPlaylists((prev) => [...prev, { id: newPlaylistId, name: name || url, tracks: [track] }])
    setActivePlaylistId(newPlaylistId)
  }, [])

  const handleSelectTrack = useCallback((track: Track) => {
    setSelectedTrack(track)
  }, [])

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

  return (
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
          onAddUrl={handleAddUrl}
          onPlayStream={handlePlayStream}
          radioActive={radioActive}
          onRadioTabChange={handleRadioTabChange}
          onSelectPlaylist={handleSelectPlaylist}
          onAddPlaylist={handleAddPlaylist}
          onRemovePlaylist={handleRemovePlaylist}
          onRenamePlaylist={handleRenamePlaylist}
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
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: 'var(--bg-base)',
    overflow: 'hidden',
  },
  titleBar: {
    height: 28,
    flexShrink: 0,
    background: 'var(--bg-base)',
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
