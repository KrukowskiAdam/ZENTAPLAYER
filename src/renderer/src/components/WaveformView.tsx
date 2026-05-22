import { useEffect, useRef, useCallback } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/plugins/regions'
import type { Track, PlayerState } from '../types'

interface Props {
  track: Track | null
  player: PlayerState
  onPlayerChange: (p: PlayerState | ((prev: PlayerState) => PlayerState)) => void
  onReady?: (blobUrl: string, peaks: number[][], duration: number) => void
}

export default function WaveformView({ track, player, onPlayerChange, onReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WaveSurfer | null>(null)
  const regionsRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null)
  const loopRegionRef = useRef<any>(null)
  const blobUrlRef = useRef<string | null>(null)
  const playerRef = useRef(player)
  playerRef.current = player

  const destroyWS = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.destroy()
      wsRef.current = null
      regionsRef.current = null
      loopRegionRef.current = null
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!track || !containerRef.current) {
      destroyWS()
      return
    }

    destroyWS()

    const regions = RegionsPlugin.create()
    regionsRef.current = regions

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: 'var(--waveform)',
      progressColor: 'var(--waveform-prog)',
      cursorColor: 'var(--cursor)',
      cursorWidth: 2,
      height: 128,
      normalize: true,
      interact: true,
      fillParent: true,
      minPxPerSec: 50,
      plugins: [regions],
    })

    wsRef.current = ws

    ws.on('ready', (duration) => {
      onPlayerChange((p) => ({ ...p, duration, playing: false, currentTime: 0 }))
      if (onReady && blobUrlRef.current) {
        onReady(blobUrlRef.current, ws.exportPeaks(), duration)
      }
    })

    ws.on('timeupdate', (currentTime) => {
      const p = playerRef.current
      onPlayerChange((prev) => ({ ...prev, currentTime }))

      if (p.loopEnabled && p.loopStart !== null && p.loopEnd !== null) {
        if (currentTime >= p.loopEnd) {
          ws.setTime(p.loopStart)
        }
      }
    })

    ws.on('finish', () => {
      const p = playerRef.current
      if (p.loopEnabled && p.loopStart !== null && p.loopEnd !== null) {
        ws.setTime(p.loopStart)
        ws.play()
      } else {
        onPlayerChange((prev) => ({ ...prev, playing: false }))
      }
    })

    regions.on('region-created', (region) => {
      if (loopRegionRef.current && loopRegionRef.current.id !== region.id) {
        loopRegionRef.current.remove()
      }
      loopRegionRef.current = region

      onPlayerChange((prev) => ({
        ...prev,
        loopStart: region.start,
        loopEnd: region.end,
        loopEnabled: true,
      }))
    })

    regions.on('region-updated', (region) => {
      onPlayerChange((prev) => ({
        ...prev,
        loopStart: region.start,
        loopEnd: region.end,
      }))
    })

    const ext = track.path.split('.').pop()?.toLowerCase() ?? ''
    const mimeMap: Record<string, string> = {
      mp3: 'audio/mpeg', flac: 'audio/flac', wav: 'audio/wav',
      ogg: 'audio/ogg', aac: 'audio/aac', m4a: 'audio/mp4',
    }
    ;(window as any).electronAPI.readAudioFile(track.path).then((data: Uint8Array) => {
      if (!wsRef.current) return
      const blob = new Blob([data.buffer as ArrayBuffer], { type: mimeMap[ext] ?? 'audio/mpeg' })
      const url = URL.createObjectURL(blob)
      blobUrlRef.current = url
      return ws.load(url)
    }).catch(console.error)

    return destroyWS
  }, [track, destroyWS])

  // Sync play/pause from outside
  useEffect(() => {
    const ws = wsRef.current
    if (!ws || !ws.getDuration()) return

    if (player.playing && !ws.isPlaying()) {
      ws.play()
    } else if (!player.playing && ws.isPlaying()) {
      ws.pause()
    }
  }, [player.playing])

  // Sync volume
  useEffect(() => {
    wsRef.current?.setVolume(player.volume)
  }, [player.volume])

  // Sync speed with pitch preservation
  useEffect(() => {
    wsRef.current?.setPlaybackRate(player.speed, true)
  }, [player.speed])

  if (!track) {
    return (
      <div id="waveform-empty" style={styles.empty}>
        <div style={styles.emptyIcon}>◈</div>
        <div style={styles.emptyText}>Select a track to view waveform</div>
      </div>
    )
  }

  return (
    <div id="waveform-view" style={styles.wrapper}>
      <div id="waveform-ruler" style={styles.rulerRow}>
        <TimeRuler duration={player.duration} />
      </div>
      <div id="waveform-row" style={styles.waveRow}>
        <div id="waveform-label" style={styles.trackLabel}>
          <span style={styles.trackName}>{track.name}</span>
        </div>
        <div id="waveform-canvas" style={styles.waveContainer} ref={containerRef} />
      </div>
      {(player.loopStart !== null && player.loopEnd !== null) && (
        <div style={styles.loopInfo}>
          <span style={styles.loopBadge}>LOOP</span>
          <span style={styles.loopRange}>
            {formatTime(player.loopStart)} — {formatTime(player.loopEnd)}
          </span>
          <button
            style={styles.clearLoop}
            onClick={() => {
              loopRegionRef.current?.remove()
              loopRegionRef.current = null
              onPlayerChange((p) => ({
                ...p,
                loopEnabled: false,
                loopStart: null,
                loopEnd: null,
              }))
            }}
          >
            ✕ clear
          </button>
        </div>
      )}
    </div>
  )
}

function TimeRuler({ duration }: { duration: number }) {
  if (!duration) return <div style={{ height: 20 }} />

  const markers: JSX.Element[] = []
  const step = duration > 120 ? 30 : duration > 30 ? 10 : 5
  for (let t = 0; t <= duration; t += step) {
    const pct = (t / duration) * 100
    markers.push(
      <div key={t} style={{ ...rulerStyles.marker, left: `${pct}%` }}>
        <div style={rulerStyles.tick} />
        <span style={rulerStyles.label}>{formatTime(t)}</span>
      </div>
    )
  }

  return <div style={rulerStyles.root}>{markers}</div>
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

const rulerStyles: Record<string, React.CSSProperties> = {
  root: {
    position: 'relative',
    height: 20,
    background: 'var(--bg-panel)',
    borderBottom: '1px solid var(--border)',
  },
  marker: {
    position: 'absolute',
    transform: 'translateX(-50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  tick: {
    width: 1,
    height: 6,
    background: 'var(--border-bright)',
  },
  label: {
    fontSize: 9,
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-mono)',
    marginTop: 2,
  },
}

const styles: Record<string, React.CSSProperties> = {
  empty: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    color: 'var(--text-muted)',
  },
  emptyIcon: {
    fontSize: 48,
    opacity: 0.2,
  },
  emptyText: {
    fontSize: 13,
    color: 'var(--text-muted)',
  },
  wrapper: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-track)',
    overflow: 'hidden',
    minHeight: 0,
  },
  rulerRow: {
    flexShrink: 0,
  },
  waveRow: {
    flex: 1,
    display: 'flex',
    minHeight: 0,
    overflow: 'hidden',
    borderBottom: '1px solid var(--border)',
  },
  trackLabel: {
    width: 140,
    flexShrink: 0,
    background: 'var(--bg-panel)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    padding: '0 12px',
  },
  trackName: {
    fontSize: 11,
    color: 'var(--text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: 'var(--font-mono)',
  },
  waveContainer: {
    flex: 1,
    minHeight: 0,
    cursor: 'crosshair',
  },
  loopInfo: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '5px 14px',
    background: 'var(--bg-panel)',
    borderBottom: '1px solid var(--border)',
  },
  loopBadge: {
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    letterSpacing: '0.1em',
    color: 'var(--accent)',
    background: 'var(--accent-dim)',
    padding: '2px 6px',
    borderRadius: 3,
  },
  loopRange: {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    color: 'var(--text-secondary)',
  },
  clearLoop: {
    marginLeft: 'auto',
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: 11,
    fontFamily: 'var(--font)',
  },
}
