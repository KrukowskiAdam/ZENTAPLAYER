const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export interface PitchResult {
  frequency: number
  noteName: string
  octave: number
  /** Deviation from the nearest equal-tempered note, in cents (-50..+50). */
  cents: number
}

const SILENCE_RMS = 0.01
const MIN_FREQ = 40   // just below guitar low E1 (41Hz)
const MAX_FREQ = 1500 // covers vocal + most melodic instrument fundamentals

// Autocorrelation pitch detector restricted to the musically useful lag range
// (avoids the octave errors a full-range search is prone to, and keeps the
// O(lagRange * windowSize) cost small). Returns null on silence or when no
// clear periodicity is found.
export function detectPitch(buf: Float32Array, sampleRate: number): number | null {
  const size = buf.length
  let rms = 0
  for (let i = 0; i < size; i++) rms += buf[i] * buf[i]
  rms = Math.sqrt(rms / size)
  if (rms < SILENCE_RMS) return null

  const minLag = Math.floor(sampleRate / MAX_FREQ)
  const maxLag = Math.min(Math.floor(sampleRate / MIN_FREQ), size - 1)
  if (maxLag <= minLag) return null

  let bestLag = -1
  let bestValue = -Infinity
  for (let lag = minLag; lag <= maxLag; lag++) {
    let sum = 0
    for (let i = 0; i < size - lag; i++) sum += buf[i] * buf[i + lag]
    if (sum > bestValue) {
      bestValue = sum
      bestLag = lag
    }
  }
  if (bestLag <= minLag || bestValue <= 0) return null

  // Parabolic interpolation around the peak for sub-sample (sub-Hz) accuracy
  const correlationAt = (lag: number) => {
    let sum = 0
    for (let i = 0; i < size - lag; i++) sum += buf[i] * buf[i + lag]
    return sum
  }
  const x1 = correlationAt(bestLag - 1)
  const x2 = bestValue
  const x3 = correlationAt(bestLag + 1)
  const a = (x1 + x3 - 2 * x2) / 2
  const b = (x3 - x1) / 2
  const refinedLag = a !== 0 ? bestLag - b / (2 * a) : bestLag

  if (refinedLag <= 0) return null
  const frequency = sampleRate / refinedLag
  if (!isFinite(frequency) || frequency < MIN_FREQ || frequency > MAX_FREQ) return null
  return frequency
}

export function frequencyToNote(frequency: number): PitchResult {
  const A4 = 440
  const midi = 69 + 12 * Math.log2(frequency / A4)
  const roundedMidi = Math.round(midi)
  const exactFrequency = A4 * Math.pow(2, (roundedMidi - 69) / 12)
  const cents = Math.round(1200 * Math.log2(frequency / exactFrequency))
  const noteIndex = ((roundedMidi % 12) + 12) % 12
  const octave = Math.floor(roundedMidi / 12) - 1
  return { frequency, noteName: NOTE_NAMES[noteIndex], octave, cents }
}
