import { useState, useCallback, useEffect, useRef } from 'react'
import { ChevronDown, Play, Voice2, Heart, CloseSquare } from 'react-iconly'

function CustomSelect({ value, onChange, options, placeholder }: {
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button style={sel.trigger} onClick={() => setOpen((o) => !o)}>
        <span style={sel.triggerLabel}>{value || placeholder}</span>
        <span style={sel.arrow}><ChevronDown set="light" size={11} primaryColor="currentColor" /></span>
      </button>
      {open && (
        <div style={sel.dropdown}>
          <div style={sel.option} onMouseDown={() => { onChange(''); setOpen(false) }}>
            {placeholder}
          </div>
          {options.map((opt) => (
            <div
              key={opt}
              style={{ ...sel.option, ...(value === opt ? sel.optionActive : {}) }}
              onMouseDown={() => { onChange(opt); setOpen(false) }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const sel: Record<string, React.CSSProperties> = {
  trigger: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    background: 'var(--bg-content-alt)',
    border: '1px solid var(--content-border)',
    borderRadius: 4,
    color: 'var(--content-text-secondary)',
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    padding: '4px 6px',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  triggerLabel: {
    flex: 1,
  },
  arrow: {
    display: 'flex',
    opacity: 0.6,
  },
  dropdown: {
    position: 'absolute' as const,
    top: '100%',
    left: 0,
    marginTop: 2,
    background: 'var(--bg-content)',
    border: '1px solid var(--content-border)',
    borderRadius: 4,
    zIndex: 200,
    maxHeight: 180,
    overflowY: 'auto' as const,
    minWidth: '100%',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
  },
  option: {
    padding: '5px 10px',
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    color: 'var(--content-text-secondary)',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  optionActive: {
    color: 'var(--accent)',
    background: 'var(--accent-dim)',
  },
}

interface RadioStation {
  stationuuid: string
  name: string
  url_resolved: string
  country: string
  tags: string
  bitrate: number
}

interface Favorite {
  uuid: string
  name: string
  url: string
  country: string
  tags: string
}

const COUNTRIES = [
  'Poland', 'United States', 'United Kingdom', 'Germany', 'France',
  'Spain', 'Italy', 'Brazil', 'Japan', 'Australia', 'Netherlands',
  'Sweden', 'Norway', 'Canada', 'Austria', 'Russia', 'Ukraine',
  'Czech Republic', 'Hungary', 'Portugal',
]

const GENRES = [
  'pop', 'rock', 'jazz', 'classical', 'electronic', 'hiphop',
  'country', 'news', 'dance', 'indie', 'metal', 'blues',
  'reggae', 'house', 'techno', 'ambient', 'folk', 'hits',
]

function loadFavorites(): Favorite[] {
  try { return JSON.parse(localStorage.getItem('radio-favorites') ?? '[]') } catch { return [] }
}

function saveFavorites(favs: Favorite[]) {
  localStorage.setItem('radio-favorites', JSON.stringify(favs))
}

export default function RadioPanel({ onPlayStream }: { onPlayStream: (url: string, name: string) => void }) {
  const [country, setCountry] = useState('')
  const [genre, setGenre] = useState('')
  const [stations, setStations] = useState<RadioStation[]>([])
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [favorites, setFavorites] = useState<Favorite[]>(loadFavorites)

  const current = stations[index] ?? null

  useEffect(() => {
    setStations([])
    setIndex(0)
  }, [country, genre])

  const fetchAndPlay = useCallback(async (startIndex = 0) => {
    setLoading(true)
    setError('')
    try {
      // order=random on the Radio Browser API is not actually randomized per-request —
      // the same query returns the same stations in the same order every time (server-side
      // caching). Fetch a larger pool and shuffle it ourselves so "Random" is actually random.
      const params = new URLSearchParams({ limit: '100', hidebroken: 'true' })
      if (country) params.set('country', country)
      if (genre) params.set('tag', genre)
      // all.api.radio-browser.info round-robins across all healthy mirror servers instead
      // of pinning to one (de1), which can go down or lag on its own.
      const res = await fetch(`https://all.api.radio-browser.info/json/stations/search?${params}`)
      if (!res.ok) throw new Error('API error')
      const data: RadioStation[] = await res.json()
      const valid = data.filter((s) => s.url_resolved)
      if (!valid.length) { setError('no stations'); setLoading(false); return }
      for (let i = valid.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[valid[i], valid[j]] = [valid[j], valid[i]]
      }
      setStations(valid)
      setIndex(startIndex)
      onPlayStream(valid[startIndex].url_resolved, valid[startIndex].name)
    } catch {
      setError('Błąd połączenia z Radio Browser API')
    }
    setLoading(false)
  }, [country, genre, onPlayStream])

  const goNext = useCallback(async () => {
    if (stations.length === 0) { fetchAndPlay(0); return }
    if (index < stations.length - 1) {
      const next = index + 1
      setIndex(next)
      onPlayStream(stations[next].url_resolved, stations[next].name)
    } else {
      fetchAndPlay(0)
    }
  }, [stations, index, fetchAndPlay, onPlayStream])

  const toggleFavorite = useCallback(() => {
    if (!current) return
    setFavorites((prev) => {
      const exists = prev.some((f) => f.uuid === current.stationuuid)
      const next = exists
        ? prev.filter((f) => f.uuid !== current.stationuuid)
        : [{ uuid: current.stationuuid, name: current.name, url: current.url_resolved, country: current.country, tags: current.tags }, ...prev]
      saveFavorites(next)
      return next
    })
  }, [current])

  const removeFavorite = useCallback((uuid: string) => {
    setFavorites((prev) => { const next = prev.filter((f) => f.uuid !== uuid); saveFavorites(next); return next })
  }, [])

  const isFavorite = current ? favorites.some((f) => f.uuid === current.stationuuid) : false

  return (
    <div style={styles.panel}>
      <div style={styles.heading}>
        <span style={styles.headingIcon}><Voice2 set="light" size={28} primaryColor="currentColor" /></span>
        <div>
          <div style={styles.headingTitle}>Random Radio Explorer</div>
          <div style={styles.headingSubtitle}>30,000+ stations worldwide</div>
        </div>
      </div>
      <div style={styles.toolbar}>
        <CustomSelect value={country} onChange={setCountry} options={COUNTRIES} placeholder="Country" />
        <CustomSelect value={genre} onChange={setGenre} options={GENRES} placeholder="Genre" />
        <button style={styles.randomBtn} onClick={goNext} disabled={loading} title="Play random station">
          {loading ? '...' : <><Play set="light" size={11} primaryColor="currentColor" /> Random</>}
        </button>
      </div>

      {error && <div style={styles.error}>No stations found</div>}

      {current && (
        <div style={styles.currentBox}>
          <div style={styles.currentDot} />
          <div style={styles.currentInfo}>
            <div style={styles.currentName}>{current.name}</div>
            <div style={styles.currentMeta}>
              {[current.country, current.tags?.split(',')[0]?.trim(), current.bitrate ? `${current.bitrate}kbps` : ''].filter(Boolean).join(' · ')}
            </div>
          </div>
          <button
            style={{ ...styles.favBtn, ...(isFavorite ? styles.favActive : {}) }}
            onClick={toggleFavorite}
            title={isFavorite ? 'Remove from favorites' : 'Save to favorites'}
          >
            <Heart set={isFavorite ? 'bold' : 'light'} size={14} primaryColor="currentColor" />
          </button>
        </div>
      )}

      {favorites.length > 0 && (
        <div style={styles.favSection}>
          <div style={styles.favTitle}>FAVORITES</div>
          {favorites.map((fav) => (
            <div key={fav.uuid} style={styles.favRow} onClick={() => onPlayStream(fav.url, fav.name)}>
              <span style={styles.favPlay}><Play set="light" size={10} primaryColor="currentColor" /></span>
              <div style={styles.favInfo}>
                <span style={styles.favName} title={fav.name}>{fav.name}</span>
                <span style={styles.favMeta}>{[fav.country, fav.tags?.split(',')[0]?.trim()].filter(Boolean).join(' · ')}</span>
              </div>
              <button style={styles.favRemove} onClick={(e) => { e.stopPropagation(); removeFavorite(fav.uuid) }} title="Remove">
                <CloseSquare set="light" size={11} primaryColor="currentColor" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  panel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    padding: '12px 12px 0',
    gap: 10,
    background: 'var(--bg-content)',
  },
  heading: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '4px 0 6px',
  },
  headingIcon: {
    display: 'flex',
    flexShrink: 0,
    color: 'var(--accent)',
  },
  headingTitle: {
    fontFamily: "'Michroma', var(--font)",
    fontSize: 15,
    fontWeight: 700,
    color: 'var(--accent)',
    letterSpacing: '0.02em',
    lineHeight: 1.2,
  },
  headingSubtitle: {
    fontSize: 10,
    color: 'var(--content-text-secondary)',
    fontFamily: 'var(--font-mono)',
    marginTop: 2,
  },
  toolbar: {
    display: 'flex',
    gap: 5,
    alignItems: 'center',
    flexWrap: 'wrap' as const,
  },
  randomBtn: {
    flexShrink: 0,
    height: 26,
    padding: '0 8px',
    background: 'var(--accent-dim)',
    border: 'none',
    borderRadius: 4,
    color: 'var(--accent)',
    fontSize: 10,
    fontWeight: 700,
    fontFamily: 'var(--font-mono)',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  favBtn: {
    flexShrink: 0,
    background: 'transparent',
    border: '1px solid var(--content-border)',
    borderRadius: 4,
    color: 'var(--content-text-secondary)',
    fontSize: 13,
    width: 28,
    height: 28,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  favActive: {
    color: 'var(--accent)',
    border: '1px solid var(--accent-border)',
    background: 'var(--accent-dim)',
  },
  error: {
    fontSize: 11,
    color: 'var(--danger)',
    fontFamily: 'var(--font-mono)',
    padding: '4px 0',
  },
  currentBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '10px 12px',
    background: 'var(--bg-content-alt)',
    borderRadius: 5,
    border: '1px solid var(--content-border)',
  },
  currentDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: 'var(--accent)',
    flexShrink: 0,
    boxShadow: '0 0 6px var(--accent)',
  },
  currentInfo: {
    flex: 1,
    minWidth: 0,
  },
  currentName: {
    fontSize: 12,
    color: 'var(--content-text)',
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  currentMeta: {
    fontSize: 10,
    color: 'var(--content-text-secondary)',
    fontFamily: 'var(--font-mono)',
    marginTop: 2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  favSection: {
    flex: 1,
    overflowY: 'auto',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  favTitle: {
    fontSize: 9,
    fontFamily: 'var(--font-mono)',
    fontWeight: 700,
    letterSpacing: '0.12em',
    color: 'var(--content-text-secondary)',
    padding: '8px 0 4px',
    flexShrink: 0,
  },
  favRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '5px 0',
    borderBottom: '1px solid var(--content-border)',
    cursor: 'pointer',
  },
  favPlay: {
    display: 'flex',
    background: 'transparent',
    border: 'none',
    color: 'var(--accent)',
    cursor: 'pointer',
    flexShrink: 0,
    padding: '0 4px',
  },
  favInfo: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  favName: {
    fontSize: 11,
    color: 'var(--content-text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  favMeta: {
    fontSize: 9,
    color: 'var(--content-text-secondary)',
    fontFamily: 'var(--font-mono)',
  },
  favRemove: {
    display: 'flex',
    background: 'transparent',
    border: 'none',
    color: 'var(--content-text-secondary)',
    cursor: 'pointer',
    flexShrink: 0,
    padding: '0 2px',
  },
}
