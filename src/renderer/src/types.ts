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
  year?: string
  genre?: string
  favorite?: boolean
}

export interface Playlist {
  id: string
  name: string
  tracks: Track[]
  /** Folders ever added to this playlist via "Add Folder" — rescanned by "Update Folders". */
  sourceFolders?: string[]
  /**
   * True only for a name this app generated itself (e.g. "Playlist 2") and the user
   * has never overridden — lets removing a playlist renumber the auto-named ones
   * without also clobbering a manually-chosen name that happens to match the pattern.
   */
  isDefaultName?: boolean
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
