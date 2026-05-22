export interface Track {
  id: string
  path: string
  name: string
  isStream?: boolean
  artist?: string
  album?: string
  title?: string
  trackNumber?: number
  duration?: number
  coverDataUrl?: string
}

export interface Playlist {
  id: string
  name: string
  tracks: Track[]
}

export type PlayMode = 'sequence' | 'shuffle' | 'repeat-one'

export interface PlayerState {
  playing: boolean
  currentTime: number
  duration: number
  volume: number
  speed: number
  loopEnabled: boolean
  loopStart: number | null
  loopEnd: number | null
  seekTo: number | null
  playMode: PlayMode
}
