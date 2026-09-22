import { useRef } from 'react'
import { VolumeUp, VolumeOff } from 'react-iconly'
import { Play, Pause } from './icons'
import type { PlayerState, PlayMode } from '../types'
import knobUrl from '../assets/textures/knob.png'
import brushedMetalUrl from '../assets/textures/brushed-metal.jpg'

interface Props {
  player: PlayerState
  onPlayerChange: (p: PlayerState | ((prev: PlayerState) => PlayerState)) => void
  isStream?: boolean
}

const SPEED_PRESETS = [0.5, 0.75, 1.0, 1.25]

const PLAY_MODE_CYCLE: Record<PlayMode, PlayMode> = {
  sequence: 'shuffle',
  shuffle: 'repeat-one',
  'repeat-one': 'sequence',
}

const PLAY_MODE_ICON: Record<PlayMode, string> = {
  sequence: '⇉',
  shuffle: '⇄',
  'repeat-one': '↺',
}

const PLAY_MODE_TITLE: Record<PlayMode, string> = {
  sequence: 'Play in sequence',
  shuffle: 'Shuffle',
  'repeat-one': 'Repeat one',
}

export default function Transport({ player, onPlayerChange, isStream = false }: Props) {
  const toggle = () => onPlayerChange((p) => ({ ...p, playing: !p.playing }))

  const toggleLoop = () =>
    onPlayerChange((p) => {
      if (p.loopEnabled) return { ...p, loopEnabled: false }
      if (p.loopStart !== null && p.loopEnd !== null) return { ...p, loopEnabled: true }
      if (!p.duration) return p
      // No region selected on the waveform yet — loop the whole track
      return { ...p, loopEnabled: true, loopStart: 0, loopEnd: p.duration }
    })

  const cyclePlayMode = () =>
    onPlayerChange((p) => ({ ...p, playMode: PLAY_MODE_CYCLE[p.playMode] }))

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!player.duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const time = pct * player.duration
    onPlayerChange((p) => ({ ...p, currentTime: time, seekTo: time }))
  }

  const setSpeed = (s: number) =>
    onPlayerChange((p) => ({ ...p, speed: Math.round(s * 100) / 100 }))

  const isMuted = player.volume === 0
  const prevVolumeRef = useRef(player.volume || 0.7)
  if (player.volume > 0) prevVolumeRef.current = player.volume

  const toggleMute = () =>
    onPlayerChange((p) => ({ ...p, volume: isMuted ? prevVolumeRef.current : 0 }))

  const progress = player.duration ? player.currentTime / player.duration : 0

  return (
    <div id="transport-bar" style={styles.bar}>
      <div id="transport-left" style={styles.left}>
        <button id="transport-play" style={styles.bigBtn} onClick={toggle} title={player.playing ? 'Pause' : 'Play'}>
          {player.playing
            ? <Pause size={15} color="currentColor" />
            : <Play size={15} color="currentColor" />}
        </button>
        {!isStream && (
          <>
            <button
              id="transport-loop"
              style={{
                ...styles.btn,
                ...(player.loopEnabled && player.loopStart !== null ? styles.btnActive : {}),
                ...(!player.duration ? styles.btnDisabled : {}),
              }}
              onClick={toggleLoop}
              disabled={!player.duration}
              title={
                player.loopEnabled
                  ? 'Disable loop'
                  : player.loopStart !== null
                  ? 'Enable loop'
                  : 'Loop the whole track (drag on waveform for a custom range)'
              }
            >
              ⟳
            </button>
            <button
              id="transport-playmode"
              style={{
                ...styles.btn,
                ...(player.playMode !== 'sequence' ? styles.btnActive : {}),
                position: 'relative',
                fontSize: 15,
              }}
              onClick={cyclePlayMode}
              title={PLAY_MODE_TITLE[player.playMode]}
            >
              {PLAY_MODE_ICON[player.playMode]}
              {player.playMode === 'repeat-one' && (
                <span style={styles.modeBadge}>1</span>
              )}
            </button>
            <div id="transport-speed" style={styles.speedGroup}>
              {SPEED_PRESETS.map((s) => (
                <button
                  key={s}
                  style={{
                    ...styles.speedBtn,
                    ...(player.speed === s ? styles.speedBtnActive : {}),
                  }}
                  onClick={() => setSpeed(s)}
                  title={`${s}× speed`}
                >
                  {s === 1 ? '1×' : `${s}×`}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div id="transport-center" style={styles.center}>
        {isStream ? (
          <div style={styles.liveBadge}>
            <span style={styles.liveDot} />
            LIVE
          </div>
        ) : (
        <div id="transport-seekbar" style={styles.seekBar} onClick={seek}>
          <div style={{ ...styles.seekFill, width: `${progress * 100}%` }} />
          {player.loopStart !== null && player.loopEnd !== null && player.duration > 0 && (
            <div
              style={{
                ...styles.seekLoop,
                left: `${(player.loopStart / player.duration) * 100}%`,
                width: `${((player.loopEnd - player.loopStart) / player.duration) * 100}%`,
              }}
            />
          )}
          <div
            style={{
              ...styles.seekThumb,
              left: `${progress * 100}%`,
            }}
          />
        </div>
        )}
      </div>

      <div id="transport-right" style={styles.right}>
        {!isStream && (
          <span style={styles.time}>
            {formatTime(player.currentTime)}
            <span style={styles.timeSep}> / </span>
            {formatTime(player.duration)}
          </span>
        )}
        <input
          type="range"
          className="slider-glow"
          min={0}
          max={1}
          step={0.01}
          value={player.volume}
          style={styles.vol}
          onChange={(e) =>
            onPlayerChange((p) => ({ ...p, volume: parseFloat(e.target.value) }))
          }
          title={`Volume ${Math.round(player.volume * 100)}%`}
        />
        <button
          id="transport-mute"
          style={styles.muteBtn}
          onClick={toggleMute}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted
            ? <VolumeOff set="light" size={16} primaryColor="var(--content-text-secondary)" />
            : <VolumeUp set="light" size={16} primaryColor="var(--accent)" />}
        </button>
      </div>
    </div>
  )
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  const ms = Math.floor((s % 1) * 10)
  return `${m}:${sec.toString().padStart(2, '0')}.${ms}`
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    flexShrink: 0,
    height: 52,
    display: 'flex',
    alignItems: 'center',
    gap: 16,
    padding: '0 16px',
    backgroundImage: `url(${brushedMetalUrl})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    borderTop: '1px solid var(--content-border)',
  },
  left: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  bigBtn: {
    width: 36,
    height: 36,
    borderRadius: '50%',
    border: '2px solid var(--accent)',
    background: `url('${knobUrl}') center/cover no-repeat`,
    color: 'var(--accent)',
    fontSize: 14,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    boxShadow: 'var(--accent-glow-lg)',
  },
  btn: {
    width: 28,
    height: 28,
    borderRadius: 4,
    border: '1px solid var(--content-border)',
    background: 'transparent',
    color: 'var(--content-text-secondary)',
    fontSize: 16,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnActive: {
    color: 'var(--accent)',
    border: '1px solid var(--accent-border)',
    background: 'var(--accent-dim)',
    boxShadow: 'var(--accent-glow)',
    textShadow: 'var(--accent-glow)',
  },
  btnDisabled: {
    opacity: 0.35,
    cursor: 'default',
  },
  center: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
  },
  seekBar: {
    flex: 1,
    height: 4,
    background: 'var(--content-border)',
    borderRadius: 2,
    cursor: 'pointer',
    position: 'relative',
  },
  seekFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: '100%',
    background: 'var(--accent)',
    borderRadius: 2,
    pointerEvents: 'none',
  },
  seekLoop: {
    position: 'absolute',
    top: -2,
    height: 8,
    background: 'var(--accent-region)',
    border: '1px solid var(--accent-border)',
    borderRadius: 2,
    pointerEvents: 'none',
  },
  seekThumb: {
    position: 'absolute',
    top: '50%',
    transform: 'translate(-50%, -50%)',
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: 'var(--accent)',
    boxShadow: 'var(--accent-glow)',
    pointerEvents: 'none',
  },
  right: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    flexShrink: 0,
  },
  time: {
    fontFamily: 'var(--font-mono)',
    fontSize: 12,
    color: 'var(--content-text-secondary)',
    whiteSpace: 'nowrap',
    // Proportional digits (e.g. a slim "1" vs a wide "8") change this span's
    // width every tick, which shifts the whole flexShrink:0 `right` block and
    // makes the seekbar next to it visibly wobble left/right. Tabular figures
    // give every digit the same width so the counter's width stays constant.
    fontVariantNumeric: 'tabular-nums',
  },
  timeSep: {
    color: 'var(--content-text-secondary)',
    opacity: 0.6,
  },
  vol: {
    width: 70,
  },
  muteBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: 'none',
    padding: 0,
    marginLeft: 6,
    cursor: 'pointer',
  },
  speedGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    marginLeft: 8,
    paddingLeft: 8,
    borderLeft: '1px solid var(--content-border)',
  },
  speedBtn: {
    height: 20,
    padding: '0 6px',
    borderRadius: 3,
    border: '1px solid var(--content-border)',
    background: 'transparent',
    color: 'var(--content-text-secondary)',
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    lineHeight: '18px',
  },
  speedBtnActive: {
    color: 'var(--accent)',
    border: 'none',
    background: 'var(--accent-dim)',
    textShadow: 'var(--accent-glow)',
  },
  liveBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.12em',
    color: 'var(--accent)',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: 'var(--accent)',
    boxShadow: '0 0 6px var(--accent)',
    flexShrink: 0,
  },
  modeBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    fontSize: 7,
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    color: 'var(--accent)',
    lineHeight: 1,
  },
}
