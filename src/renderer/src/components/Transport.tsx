import type { PlayerState, PlayMode } from '../types'

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
    onPlayerChange((p) => ({
      ...p,
      loopEnabled: !p.loopEnabled,
      ...(p.loopEnabled ? { loopStart: null, loopEnd: null } : {}),
    }))

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

  const progress = player.duration ? player.currentTime / player.duration : 0

  return (
    <div id="transport-bar" style={styles.bar}>
      <div id="transport-left" style={styles.left}>
        <button id="transport-play" style={styles.bigBtn} onClick={toggle}>
          {player.playing ? '⏸' : '▶'}
        </button>
        {!isStream && (
          <>
            <button
              id="transport-loop"
              style={{
                ...styles.btn,
                ...(player.loopEnabled && player.loopStart !== null ? styles.btnActive : {}),
              }}
              onClick={toggleLoop}
              title="Toggle loop region"
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
              <input
                type="range"
                min={0.25}
                max={1.5}
                step={0.05}
                value={player.speed}
                style={styles.speedSlider}
                onChange={(e) => setSpeed(parseFloat(e.target.value))}
                title={`Speed: ${player.speed}×`}
              />
              {!SPEED_PRESETS.includes(player.speed) && (
                <span style={styles.speedCustom}>{player.speed}×</span>
              )}
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
        <span style={styles.time}>
          {formatTime(player.currentTime)}
          <span style={styles.timeSep}> / </span>
          {formatTime(player.duration)}
        </span>
        <input
          type="range"
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
    background: 'var(--bg-panel)',
    borderTop: '1px solid var(--border)',
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
    border: '1px solid var(--border-bright)',
    background: 'var(--bg-hover)',
    color: 'var(--text-primary)',
    fontSize: 14,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  btn: {
    width: 28,
    height: 28,
    borderRadius: 4,
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text-secondary)',
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
    background: 'var(--border)',
    borderRadius: 2,
    cursor: 'pointer',
    position: 'relative',
  },
  seekFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: '100%',
    background: 'var(--waveform-prog)',
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
    color: 'var(--text-secondary)',
    whiteSpace: 'nowrap',
  },
  timeSep: {
    color: 'var(--text-muted)',
  },
  vol: {
    width: 70,
    accentColor: 'var(--accent)',
    cursor: 'pointer',
  },
  speedGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    marginLeft: 8,
    paddingLeft: 8,
    borderLeft: '1px solid var(--border)',
  },
  speedBtn: {
    height: 20,
    padding: '0 6px',
    borderRadius: 3,
    border: '1px solid var(--border)',
    background: 'transparent',
    color: 'var(--text-muted)',
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
  },
  speedSlider: {
    width: 64,
    accentColor: 'var(--accent)',
    cursor: 'pointer',
    marginLeft: 2,
  },
  speedCustom: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--accent)',
    minWidth: 28,
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
