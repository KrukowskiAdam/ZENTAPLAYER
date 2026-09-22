import { useEffect, useRef, useCallback, useState } from 'react'
import WaveSurfer from 'wavesurfer.js'
import RegionsPlugin from 'wavesurfer.js/plugins/regions'
import AudioMotionAnalyzer from 'audiomotion-analyzer'
import { Voice } from 'react-iconly'
import type { Track, PlayerState } from '../types'
import { detectPitch, frequencyToNote, type PitchResult } from '../audio/pitch'

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

interface Props {
  track: Track | null
  player: PlayerState
  onPlayerChange: (p: PlayerState | ((prev: PlayerState) => PlayerState)) => void
  onFinish?: () => void
}

// Phosphor-green VFD look (Sansui 9090 / Sony STR-6055 style) — the app's one
// permanent waveform theme, scoped via #loop-editor[data-skin="vintage-green"]
// in global.css. There used to be a switchable "Default" skin here; it was
// removed because most of the rest of the app had already gone permanently
// green too, so toggling it back produced a broken half-and-half look.
const WAVE_COLOR = '#0f6b53'
const PROGRESS_COLOR = '#39ffc0'
const CURSOR_COLOR = '#baffe3'

export default function LoopEditorPanel({ track, player, onPlayerChange, onFinish }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WaveSurfer | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const regionsRef = useRef<ReturnType<typeof RegionsPlugin.create> | null>(null)
  const loopRegionRef = useRef<any>(null)
  const blobUrlRef = useRef<string | null>(null)
  const playerRef = useRef(player)
  const playOnReadyRef = useRef(false)
  const zoomRef = useRef(50)
  const vizContainerRef = useRef<HTMLDivElement>(null)
  const audioMotionRef = useRef<AudioMotionAnalyzer | null>(null)
  const lastPitchAtRef = useRef(0)
  const [pitch, setPitch] = useState<PitchResult | null>(null)
  playerRef.current = player

  const destroy = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
    wsRef.current?.destroy()
    wsRef.current = null
    regionsRef.current = null
    loopRegionRef.current = null
    playOnReadyRef.current = false
    zoomRef.current = 50
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
    setPitch(null)
  }, [])

  useEffect(() => {
    if (!track) { destroy(); return }
    destroy()

    const audio = new Audio()
    audio.volume = playerRef.current.volume
    audioRef.current = audio

    if (playerRef.current.playing) {
      playOnReadyRef.current = true
    }

    // Stream: set src directly, skip WaveSurfer entirely
    if (track.isStream) {
      audio.src = track.path

      const onTimeUpdate = () =>
        onPlayerChange((prev) => ({ ...prev, currentTime: audio.currentTime }))
      const onCanPlay = () => {
        const dur = isFinite(audio.duration) ? audio.duration : 0
        onPlayerChange((p) => ({ ...p, duration: dur }))
        if (playOnReadyRef.current) {
          audio.play().catch(() => {})
          playOnReadyRef.current = false
          onPlayerChange((p) => ({ ...p, playing: true }))
        }
      }
      const onEnded = () => {
        if (onFinish) onFinish()
        else onPlayerChange((prev) => ({ ...prev, playing: false }))
      }

      audio.addEventListener('canplay', onCanPlay, { once: true })
      audio.addEventListener('timeupdate', onTimeUpdate)
      audio.addEventListener('ended', onEnded)

      return () => {
        audio.removeEventListener('timeupdate', onTimeUpdate)
        audio.removeEventListener('ended', onEnded)
        destroy()
      }
    }

    if (!containerRef.current) return destroy

    // Native audio element — plays immediately once blob URL is set,
    // before WaveSurfer finishes decoding the waveform
    audio.playbackRate = playerRef.current.speed

    const regions = RegionsPlugin.create()
    regionsRef.current = regions

    const ws = WaveSurfer.create({
      container: containerRef.current,
      media: audio,
      waveColor: WAVE_COLOR,
      progressColor: PROGRESS_COLOR,
      cursorColor: CURSOR_COLOR,
      cursorWidth: 2,
      height: 'auto',
      normalize: true,
      interact: true,
      fillParent: true,
      plugins: [regions],
    })

    wsRef.current = ws

    regions.enableDragSelection({ color: 'var(--accent-region)' })

    ws.on('ready', (duration) => {
      onPlayerChange((p) => ({ ...p, duration }))
      // Sync zoom tracker to actual fit-to-container level (safe for any file length)
      if (containerRef.current) {
        zoomRef.current = containerRef.current.offsetWidth / duration
      }
      if (playOnReadyRef.current) {
        audio.play().catch(() => {})
        playOnReadyRef.current = false
        onPlayerChange((p) => ({ ...p, playing: true }))
      }
    })

    ws.on('interaction', (newTime) => {
      const p = playerRef.current
      if (p.loopEnabled && p.loopStart !== null && p.loopEnd !== null) {
        if (newTime < p.loopStart || newTime > p.loopEnd) {
          loopRegionRef.current?.remove()
          loopRegionRef.current = null
          // Update ref synchronously so timeupdate doesn't snap back before React re-renders
          playerRef.current = { ...p, loopEnabled: false, loopStart: null, loopEnd: null }
          onPlayerChange((prev) => ({ ...prev, loopEnabled: false, loopStart: null, loopEnd: null }))
        }
      }
    })

    ws.on('timeupdate', (currentTime) => {
      onPlayerChange((prev) => ({ ...prev, currentTime }))
      const p = playerRef.current
      if (p.loopEnabled && p.loopStart !== null && p.loopEnd !== null) {
        if (currentTime >= p.loopEnd) ws.setTime(p.loopStart)
      }

      // Tuner only runs against a selected loop region — otherwise it's shown
      // disabled in the UI, and there's nothing meaningful to analyze anyway.
      const hasLoop = p.loopStart !== null && p.loopEnd !== null
      if (!hasLoop || audio.paused) return
      const now = performance.now()
      if (now - lastPitchAtRef.current < 90) return
      lastPitchAtRef.current = now

      const buffer = ws.getDecodedData()
      if (!buffer) return
      const channelData = buffer.getChannelData(0)
      const sampleRate = buffer.sampleRate
      const windowSize = 4096
      const center = Math.floor(currentTime * sampleRate)
      const start = Math.max(0, center - windowSize / 2)
      const end = Math.min(channelData.length, start + windowSize)
      if (end - start < 1024) { setPitch(null); return }
      const freq = detectPitch(channelData.subarray(start, end), sampleRate)
      setPitch(freq ? frequencyToNote(freq) : null)
    })

    ws.on('finish', () => {
      const p = playerRef.current
      if (p.loopEnabled && p.loopStart !== null && p.loopEnd !== null) {
        ws.setTime(p.loopStart)
        ws.play()
      } else if (onFinish) {
        onFinish()
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
        currentTime: region.start,
        seekTo: region.start,
      }))
    })

    regions.on('region-updated', (region) => {
      onPlayerChange((prev) => ({ ...prev, loopStart: region.start, loopEnd: region.end }))
    })

    const ext = track.path.split('.').pop()?.toLowerCase() ?? ''
    const mimeMap: Record<string, string> = {
      mp3: 'audio/mpeg', flac: 'audio/flac', wav: 'audio/wav',
      ogg: 'audio/ogg', aac: 'audio/aac', m4a: 'audio/mp4',
    }
    ;(window as any).electronAPI.readAudioFile(track.path).then((data: Uint8Array) => {
      if (!wsRef.current || !audioRef.current) return
      const blob = new Blob([data.buffer as ArrayBuffer], { type: mimeMap[ext] ?? 'audio/mpeg' })
      const url = URL.createObjectURL(blob)
      blobUrlRef.current = url

      // Set src on audio element — it starts buffering immediately
      audio.src = url

      // If play was requested before waveform is ready, start audio now
      if (playOnReadyRef.current) {
        audio.play().then(() => {
          playOnReadyRef.current = false
          onPlayerChange((p) => ({ ...p, playing: true }))
        }).catch(() => {
          // not buffered enough yet — will retry in ready handler
        })
      }

      // Load WaveSurfer for waveform decoding (happens in background)
      ws.load(url)
    }).catch(console.error)

    return destroy
  }, [track, destroy])

  useEffect(() => {
    if (player.seekTo === null) return
    const ws = wsRef.current
    if (!ws || !ws.getDuration()) return
    ws.setTime(player.seekTo)
    if (playerRef.current.playing && !ws.isPlaying()) ws.play()
    onPlayerChange((p) => ({ ...p, seekTo: null }))
  }, [player.seekTo])

  useEffect(() => {
    const ws = wsRef.current
    const audio = audioRef.current
    if (!ws && !audio) return

    if (player.playing) {
      if (ws && ws.getDuration()) {
        if (!ws.isPlaying()) ws.play()
      } else if (audio && audio.src) {
        // WaveSurfer not ready yet — play via audio element directly
        audio.play().catch(() => { playOnReadyRef.current = true })
      } else {
        playOnReadyRef.current = true
      }
    } else {
      playOnReadyRef.current = false
      if (ws && ws.isPlaying()) ws.pause()
      else if (audio && !audio.paused) audio.pause()
    }
  }, [player.playing])

  useEffect(() => {
    const audio = audioRef.current
    if (audio) audio.volume = player.volume
    wsRef.current?.setVolume(player.volume)
  }, [player.volume])

  useEffect(() => {
    const audio = audioRef.current
    if (audio) audio.playbackRate = player.speed
    wsRef.current?.setPlaybackRate(player.speed, true)
  }, [player.speed])

  // Remove visual region when loop is cleared externally (e.g. transport button)
  useEffect(() => {
    if (player.loopStart === null && player.loopEnd === null) {
      loopRegionRef.current?.remove()
      loopRegionRef.current = null
      setPitch(null)
    }
  }, [player.loopStart, player.loopEnd])


  // Pinch-to-zoom on trackpad (Ctrl+wheel in Chromium/Electron)
  useEffect(() => {
    const el = containerRef.current
    if (!el || !track) return

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const ws = wsRef.current
      if (!ws || !ws.getDuration()) return
      const factor = Math.exp(-e.deltaY * 0.01)
      zoomRef.current = Math.max(10, Math.min(2000, zoomRef.current * factor))
      ws.zoom(zoomRef.current)
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [track])

  // AudioMotion visualizer for streams
  useEffect(() => {
    if (!track?.isStream || !vizContainerRef.current || !audioRef.current) return

    const motion = new AudioMotionAnalyzer(vizContainerRef.current, {
      source: audioRef.current,
      height: vizContainerRef.current.offsetHeight || 160,
      mode: 0,
      showBgColor: true,
      bgAlpha: 1,
      showPeaks: true,
      showScaleX: false,
      showScaleY: false,
      reflexRatio: 0.35,
      reflexAlpha: 0.2,
      reflexBright: 1.2,
      barSpace: 0.1,
      roundBars: false,
      frequencyScale: 'log',
      minFreq: 20,
      maxFreq: 20000,
    })

    // audiomotion-analyzer draws on <canvas>, which can't resolve var(--x) the way a
    // DOM element's style can — so the theme colors have to be read out as literal
    // values here instead of referenced directly.
    motion.registerGradient('zenta', {
      bgColor: cssVar('--waveform-bg'),
      colorStops: [
        { pos: 0,   color: cssVar('--waveform-grad-1') },
        { pos: 0.4, color: cssVar('--waveform-grad-2') },
        { pos: 0.7, color: cssVar('--waveform-prog') },
        { pos: 1,   color: cssVar('--waveform-grad-4') },
      ],
    })
    motion.gradient = 'zenta'

    audioMotionRef.current = motion

    return () => {
      motion.destroy()
      audioMotionRef.current = null
    }
  }, [track])

  if (!track) {
    return (
      <div id="loop-editor" style={styles.empty}>
        <span style={styles.emptyIcon}>◈</span>
        <span style={styles.emptyText}>Select a track to start</span>
      </div>
    )
  }

  if (track.isStream) {
    return (
      <div id="loop-editor" style={styles.panel}>
        <div id="loop-editor-header" style={styles.header}>
          <span style={styles.trackName}>{track.name}</span>
          <span style={styles.streamBadge}>
            <Voice set="light" size={10} primaryColor="currentColor" /> STREAM
          </span>
          <span style={styles.streamUrl}>{track.path}</span>
        </div>
        <div style={styles.streamBody} ref={vizContainerRef} />
      </div>
    )
  }

  const hasLoop = player.loopStart !== null && player.loopEnd !== null

  return (
    <div id="loop-editor" style={styles.panel} data-skin="vintage-green">
      <div id="loop-editor-header" style={styles.header}>
        <span style={styles.trackName}>{track.name}</span>
        {hasLoop && (
          <>
            <span style={styles.loopBadge}>LOOP</span>
            <span style={styles.loopRange}>
              {fmt(player.loopStart!)} — {fmt(player.loopEnd!)}
            </span>
            <span style={styles.loopDur}>
              {(player.loopEnd! - player.loopStart!).toFixed(2)}s
            </span>
            <button
              style={styles.clearBtn}
              onClick={() => {
                loopRegionRef.current?.remove()
                loopRegionRef.current = null
                onPlayerChange((p) => ({ ...p, loopEnabled: false, loopStart: null, loopEnd: null }))
              }}
            >
              ✕ clear
            </button>
          </>
        )}
        {!hasLoop && (
          <span style={styles.hint}>drag on waveform to set loop</span>
        )}
      </div>
      <div id="loop-editor-body" style={styles.body}>
        <div id="loop-editor-canvas" style={styles.canvas} ref={containerRef} />
        <PitchTuner pitch={pitch} active={hasLoop} />
      </div>
    </div>
  )
}

function PitchTuner({ pitch, active }: { pitch: PitchResult | null; active: boolean }) {
  const cents = pitch?.cents ?? 0
  const needlePct = 50 + Math.max(-50, Math.min(50, cents))
  const inTune = active && pitch !== null && Math.abs(cents) <= 5

  return (
    <div id="pitch-tuner" style={{ ...styles.tuner, ...(active ? {} : styles.tunerDisabled) }}>
      <div style={styles.tunerNote}>{active && pitch ? `${pitch.noteName}${pitch.octave}` : '—'}</div>
      <div style={styles.tunerFreq}>{active && pitch ? `${pitch.frequency.toFixed(1)} Hz` : 'no loop'}</div>
      <div style={styles.tunerMeter}>
        <div style={styles.tunerMeterCenter} />
        {active && pitch && (
          <div
            style={{
              ...styles.tunerNeedle,
              left: `${needlePct}%`,
              background: inTune ? 'var(--accent)' : 'var(--warning)',
            }}
          />
        )}
      </div>
      <div style={styles.tunerCents}>
        {active && pitch ? `${cents > 0 ? '+' : ''}${cents}¢` : ''}
      </div>
    </div>
  )
}

function fmt(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  const cs = Math.floor((s % 1) * 100)
  return `${m}:${sec.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: '100%',
    background: 'var(--bg-track)',
    borderTop: '1px solid var(--border)',
    overflow: 'hidden',
  },
  header: {
    flexShrink: 0,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '0 14px',
    background: 'var(--bg-panel)',
    borderBottom: '1px solid var(--border)',
  },
  trackName: {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    color: 'var(--text-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: 300,
    flexShrink: 0,
  },
  loopBadge: {
    fontSize: 9,
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    letterSpacing: '0.1em',
    color: 'var(--accent)',
    background: 'var(--accent-dim)',
    padding: '1px 5px',
    borderRadius: 3,
    flexShrink: 0,
  },
  loopRange: {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    color: 'var(--text-secondary)',
    flexShrink: 0,
  },
  loopDur: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--text-muted)',
    background: 'var(--bg-hover)',
    padding: '1px 5px',
    borderRadius: 3,
    flexShrink: 0,
  },
  clearBtn: {
    marginLeft: 'auto',
    background: 'transparent',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: 11,
    fontFamily: 'var(--font)',
    flexShrink: 0,
  },
  hint: {
    fontSize: 11,
    color: 'var(--text-muted)',
  },
  streamBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    letterSpacing: '0.08em',
    color: 'var(--accent)',
    background: 'var(--accent-dim)',
    padding: '1px 6px',
    borderRadius: 3,
    flexShrink: 0,
  },
  streamUrl: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--text-muted)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    flex: 1,
    minWidth: 0,
  },
  streamBody: {
    flex: 1,
    background: 'var(--waveform-bg)',
    overflow: 'hidden',
    minHeight: 0,
  },
  body: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    overflow: 'hidden',
  },
  canvas: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    height: '100%',
    overflow: 'hidden',
  },
  tuner: {
    width: 130,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '10px 12px',
    background: 'var(--bg-panel)',
    borderLeft: '1px solid var(--border)',
    transition: 'opacity 0.15s',
  },
  tunerDisabled: {
    opacity: 0.35,
  },
  tunerNote: {
    fontFamily: 'var(--font-mono)',
    fontSize: 26,
    fontWeight: 700,
    color: 'var(--text-primary)',
    lineHeight: 1,
  },
  tunerFreq: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--text-muted)',
  },
  tunerMeter: {
    position: 'relative',
    width: '100%',
    height: 6,
    borderRadius: 3,
    background: 'var(--bg-hover)',
    border: '1px solid var(--border)',
  },
  tunerMeterCenter: {
    position: 'absolute',
    left: '50%',
    top: -2,
    bottom: -2,
    width: 1,
    background: 'var(--border-bright)',
  },
  tunerNeedle: {
    position: 'absolute',
    top: -2,
    bottom: -2,
    width: 3,
    borderRadius: 2,
    transform: 'translateX(-50%)',
  },
  tunerCents: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--text-secondary)',
    minHeight: 12,
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    height: '100%',
    background: 'var(--bg-content)',
    borderTop: '1px solid var(--content-border)',
  },
  emptyIcon: {
    fontSize: 32,
    opacity: 0.3,
    color: 'var(--content-text)',
  },
  emptyText: {
    fontSize: 12,
    color: 'var(--content-text-secondary)',
  },
}
