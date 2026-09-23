import { app, BrowserWindow, ipcMain, dialog, Menu, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { parseFile } from 'music-metadata'
import { spawn, type ChildProcess } from 'child_process'
import NodeID3 from 'node-id3'

app.setName('Espresso Player')

const isDev = !app.isPackaged

// --- Logging -----------------------------------------------------------
// Everything the main process does that could plausibly hang or fail (folder
// scans, cue lookups, ffmpeg conversions) gets a line here, so a stuck run can
// be diagnosed from Menu → Debug → Open Log File instead of guessing.
const logDir = path.join(app.getPath('userData'), 'logs')
const logPath = path.join(logDir, 'app.log')

function rotateLogIfLarge() {
  try {
    if (fs.statSync(logPath).size > 5 * 1024 * 1024) fs.renameSync(logPath, logPath + '.old')
  } catch { /* no existing log yet */ }
}

function log(...args: unknown[]) {
  const line = `[${new Date().toISOString()}] ${args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}`
  console.log(line)
  try {
    fs.mkdirSync(logDir, { recursive: true })
    fs.appendFileSync(logPath, line + '\n')
  } catch { /* logging must never crash the app */ }
}

try { fs.mkdirSync(logDir, { recursive: true }); rotateLogIfLarge() } catch { /* best effort */ }
log('--- app starting ---', { version: app.getVersion(), platform: process.platform, arch: process.arch })

process.on('uncaughtException', (err) => log('uncaughtException', { message: err.message, stack: err.stack }))
process.on('unhandledRejection', (reason) => log('unhandledRejection', { reason: String(reason) }))

let mainWindow: BrowserWindow | null = null
let isQuitting = false

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f0f0f',
    titleBarStyle: 'hiddenInset',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  // Opens maximized instead of at the fixed 1400x900 default — otherwise it looks like
  // a partial window on most screens and needs a manual double-click to zoom.
  mainWindow.once('ready-to-show', () => {
    mainWindow?.maximize()
    mainWindow?.show()
  })

  mainWindow.on('close', (e) => {
    if (process.platform === 'darwin' && !isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// Standard per-platform menu: File/Playback actions are mirrored from the in-app
// buttons (so Cmd+O etc. work like a native app), dev-only items are hidden from
// packaged builds, and diagnostics live under Help — not a developer-facing "Debug"
// menu — since this is meant to look finished, not like leftover internal tooling.
function send(channel: string) {
  mainWindow?.webContents.send(channel)
}

function buildAppMenu() {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' as const },
        { type: 'separator' as const },
        { role: 'services' as const },
        { type: 'separator' as const },
        { role: 'hide' as const },
        { role: 'hideOthers' as const },
        { role: 'unhide' as const },
        { type: 'separator' as const },
        { role: 'quit' as const },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Add Files…', accelerator: 'CmdOrCtrl+O', click: () => send('menu:add-files') },
        { label: 'Add Folder…', accelerator: 'CmdOrCtrl+Shift+O', click: () => send('menu:add-folder') },
        { label: 'Update Folders', accelerator: 'CmdOrCtrl+Shift+U', click: () => send('menu:update-folders') },
        { type: 'separator' as const },
        { label: 'New Playlist', accelerator: 'CmdOrCtrl+N', click: () => send('menu:new-playlist') },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { role: 'selectAll' as const },
      ],
    },
    {
      label: 'Playback',
      submenu: [
        { label: 'Play/Pause', click: () => send('menu:toggle-play') },
        { label: 'Toggle Loop', click: () => send('menu:toggle-loop') },
      ],
    },
    {
      label: 'View',
      submenu: [
        ...(isDev ? [
          { role: 'reload' as const },
          { role: 'toggleDevTools' as const },
          { type: 'separator' as const },
        ] : []),
        { role: 'resetZoom' as const },
        { role: 'zoomIn' as const },
        { role: 'zoomOut' as const },
        { type: 'separator' as const },
        { role: 'togglefullscreen' as const },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' as const },
        { role: 'zoom' as const },
        { role: 'close' as const },
        { type: 'separator' as const },
        { role: 'front' as const },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Open Log File',
          click: () => { log('menu: open log file'); shell.openPath(logPath) },
        },
        {
          label: 'Show Log Folder',
          click: () => { log('menu: show log folder'); shell.showItemInFolder(logPath) },
        },
        { type: 'separator' as const },
        {
          label: 'Clear Log',
          click: () => {
            try { fs.writeFileSync(logPath, '') } catch { /* ignore */ }
            log('--- log cleared ---')
          },
        },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))

  app.setAboutPanelOptions({
    applicationName: 'Espresso Player',
    applicationVersion: app.getVersion(),
    credits: 'A local-first music player for jazz, FLAC libraries, and internet radio.',
  })
}

app.whenReady().then(() => {
  buildAppMenu()
  restoreSecurityScopedAccess()
  createWindow()
})

app.on('before-quit', () => {
  isQuitting = true
  // Flush any metadata-cache writes still sitting in the debounce window so a
  // quit right after adding/rescanning a folder doesn't lose them.
  if (metadataCacheDirty && metadataCache) {
    try { fs.writeFileSync(metadataCachePath, JSON.stringify(metadataCache)) } catch { /* best effort */ }
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show()
  } else {
    createWindow()
  }
})

// App Sandbox (Mac App Store builds only): picking a file/folder via the system dialog
// grants access only for the current run. To keep reading/writing it after a relaunch —
// Update Folders, tag edits, re-importing the same library — macOS requires a security-scoped
// bookmark captured at pick time and "started" again on every launch. Outside the sandbox
// (dev, current DMG build) `securityScopedBookmarks` is simply ignored by Electron and this
// whole mechanism is inert (empty bookmarks, no-op restore), so it doesn't touch existing
// non-MAS distribution.
const bookmarksPath = path.join(app.getPath('userData'), 'security-bookmarks.json')

function loadBookmarkMap(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(bookmarksPath, 'utf-8'))
  } catch {
    return {}
  }
}

function saveBookmarks(forPaths: string[], bookmarks?: string[]) {
  if (!bookmarks?.length) return
  const map = loadBookmarkMap()
  forPaths.forEach((p, i) => {
    if (bookmarks[i]) map[p] = bookmarks[i]
  })
  try {
    fs.mkdirSync(path.dirname(bookmarksPath), { recursive: true })
    fs.writeFileSync(bookmarksPath, JSON.stringify(map), 'utf-8')
  } catch (e) {
    log('security-bookmark:save-failed', { error: String(e) })
  }
}

function restoreSecurityScopedAccess() {
  if (process.platform !== 'darwin' || typeof app.startAccessingSecurityScopedResource !== 'function') return
  const map = loadBookmarkMap()
  for (const [p, bookmark] of Object.entries(map)) {
    try {
      app.startAccessingSecurityScopedResource(bookmark)
      log('security-bookmark:restored', { path: p })
    } catch (e) {
      log('security-bookmark:restore-failed', { path: p, error: String(e) })
    }
  }
}

ipcMain.handle('open-files', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Audio', extensions: ['mp3', 'flac', 'wav', 'ogg', 'aac', 'm4a'] }],
    securityScopedBookmarks: process.platform === 'darwin',
  })
  saveBookmarks(result.filePaths, result.bookmarks)
  return result.filePaths
})

const AUDIO_EXTS = new Set(['.mp3', '.flac', '.wav', '.ogg', '.aac', '.m4a'])

function scanDirForAudio(dir: string, found: string[]) {
  let entries: fs.Dirent[]
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      scanDirForAudio(full, found)
    } else if (AUDIO_EXTS.has(path.extname(entry.name).toLowerCase())) {
      found.push(full)
    }
  }
}

ipcMain.handle('open-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'multiSelections'],
    securityScopedBookmarks: process.platform === 'darwin',
  })
  if (result.canceled || !result.filePaths.length) return { folders: [], files: [] }
  saveBookmarks(result.filePaths, result.bookmarks)

  const found: string[] = []
  for (const folderPath of result.filePaths) scanDirForAudio(folderPath, found)
  found.sort()
  return { folders: result.filePaths, files: found }
})

// Resolve a mix of dropped file/folder paths (e.g. from a Finder drag) into audio file paths
ipcMain.handle('scan-paths', async (_event, paths: string[]) => {
  const found: string[] = []
  for (const p of paths) {
    let stat: fs.Stats
    try { stat = fs.statSync(p) } catch { continue }
    if (stat.isDirectory()) {
      scanDirForAudio(p, found)
    } else if (AUDIO_EXTS.has(path.extname(p).toLowerCase())) {
      found.push(p)
    }
  }
  found.sort()
  return found
})

ipcMain.handle('read-audio-file', (_event, filePath: string) => {
  return fs.readFileSync(filePath)
})

ipcMain.handle('show-in-folder', (_event, filePath: string) => {
  shell.showItemInFolder(filePath)
})

type SavedStream = { url: string; name: string }
type SavedPlaylist = {
  id: string
  name: string
  paths: string[]
  streams?: SavedStream[]
  /** @deprecated replaced by sourceFolders — kept only so old libraries migrate cleanly */
  watchFolder?: string
  sourceFolders?: string[]
  favorites?: string[]
}
type SavedLibrary = { playlists: SavedPlaylist[]; activePlaylistId: string }

const libraryPath = path.join(app.getPath('userData'), 'library.json')

function isHttpUrl(s: unknown): s is string {
  return typeof s === 'string' && (s.startsWith('http://') || s.startsWith('https://'))
}

ipcMain.handle('load-library', (): SavedLibrary | null => {
  try {
    const raw = fs.readFileSync(libraryPath, 'utf-8')
    const data = JSON.parse(raw) as SavedLibrary
    if (!Array.isArray(data?.playlists)) return null
    return {
      playlists: data.playlists.map((p) => {
        // Migrate the old single-folder Live Folder field into the new
        // multi-folder sourceFolders list used by "Update Folders".
        const sourceFolders = new Set(
          Array.isArray(p.sourceFolders) ? p.sourceFolders.filter((fp: unknown) => typeof fp === 'string') : []
        )
        if (typeof p.watchFolder === 'string') sourceFolders.add(p.watchFolder)
        return {
          id: p.id,
          name: p.name,
          paths: (p.paths ?? []).filter((fp: unknown) => typeof fp === 'string' && fs.existsSync(fp as string)),
          streams: (p.streams ?? []).filter((s: unknown) => {
            if (typeof s !== 'object' || s === null) return false
            return isHttpUrl((s as any).url)
          }),
          sourceFolders: [...sourceFolders].filter((fp) => fs.existsSync(fp)),
          favorites: Array.isArray(p.favorites) ? p.favorites.filter((fp: unknown) => typeof fp === 'string') : [],
        }
      }),
      activePlaylistId: data.activePlaylistId,
    }
  } catch {
    return null
  }
})

ipcMain.handle('save-library', (_event, data: SavedLibrary) => {
  try {
    fs.writeFileSync(libraryPath, JSON.stringify(data), 'utf-8')
  } catch { /* ignore write errors */ }
})

// Tag/cover-art cache: without this, every single app launch re-parses every
// track's ID3 tags AND re-extracts + re-base64s its embedded cover art from
// scratch (read-metadata below), which is the main reason startup and
// playlist loading felt slow — it happened every time, not just once. Keyed
// by path + mtime/size, so an unchanged file is served straight from disk
// with no music-metadata parse at all. Cover art is additionally deduped by
// content hash into `images`, since every track on an album shares the same
// picture bytes — otherwise the same multi-hundred-KB base64 blob gets
// stored (and re-encoded) once per track instead of once per album.
const metadataCachePath = path.join(app.getPath('userData'), 'metadata-cache.json')

type CachedTrackMeta = {
  mtimeMs: number
  size: number
  title: string | null
  artist: string | null
  album: string | null
  trackNumber: number | null
  duration: number | null
  year: string | null
  genre: string | null
  coverHash: string | null
}
type MetadataCache = {
  tracks: Record<string, CachedTrackMeta>
  images: Record<string, string>
}

let metadataCache: MetadataCache | null = null
let metadataCacheDirty = false
let metadataCacheSaveTimer: NodeJS.Timeout | null = null

function loadMetadataCache(): MetadataCache {
  if (metadataCache) return metadataCache
  try {
    const raw = JSON.parse(fs.readFileSync(metadataCachePath, 'utf-8'))
    metadataCache = { tracks: raw.tracks ?? {}, images: raw.images ?? {} }
  } catch {
    metadataCache = { tracks: {}, images: {} }
  }
  return metadataCache
}

function scheduleMetadataCacheSave() {
  metadataCacheDirty = true
  if (metadataCacheSaveTimer) return
  metadataCacheSaveTimer = setTimeout(() => {
    metadataCacheSaveTimer = null
    if (!metadataCacheDirty || !metadataCache) return
    metadataCacheDirty = false
    fs.writeFile(metadataCachePath, JSON.stringify(metadataCache), () => {})
  }, 1000)
}

// Interns a cover data URL into the shared `images` table by content hash and
// returns the hash, so identical album art collapses to one stored copy.
function internCover(cache: MetadataCache, dataUrl: string | null): string | null {
  if (!dataUrl) return null
  const hash = crypto.createHash('md5').update(dataUrl).digest('hex')
  if (!cache.images[hash]) cache.images[hash] = dataUrl
  return hash
}

// Online cover-art fallback: only hit when a track has neither embedded art nor a local
// image file in its folder. Saves the result as cover.jpg next to the tracks (not embedded
// into the audio files themselves) so it becomes the new local fallback for every track in
// that album going forward, visible to any player/tool, not just this app.
const coverArtCache = new Map<string, Promise<string | null>>()

async function fetchImageBuffer(url: string, timeoutMs = 8000): Promise<Buffer | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

// Album tags on bootlegs/box-set folders are often not real album titles at all —
// "CD 1", "radio", "live" — just folder-naming artifacts. Querying iTunes with those
// returns an unrelated top match (confirmed: "Lester Young" + "CD 1" returned a Vince
// Guaraldi Christmas album). Skip the fetch entirely for names like that.
const GENERIC_ALBUM_TERMS = new Set([
  'radio', 'live', 'bootleg', 'broadcast', 'broadcasts', 'demo', 'demos',
  'unknown', 'misc', 'miscellaneous', 'various', 'session', 'sessions', 'unreleased',
])

function looksLikeJunkAlbumName(album: string, artist: string): boolean {
  let s = album.trim().toLowerCase()
  const a = artist.trim().toLowerCase()
  if (a && s.startsWith(a)) s = s.slice(a.length)
  s = s.replace(/^[\s\-–:]+/, '').replace(/[\s\-–:]+$/, '')
  if (!s || s.length < 3) return true
  if (/^(cd|disc|disk)\s*\d+$/i.test(s)) return true
  if (GENERIC_ALBUM_TERMS.has(s)) return true
  return false
}

async function fetchAlbumCoverFromItunes(artist: string, album: string): Promise<Buffer | null> {
  try {
    const term = encodeURIComponent(`${artist} ${album}`)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const res = await fetch(`https://itunes.apple.com/search?term=${term}&media=music&entity=album&limit=1`, { signal: controller.signal })
    clearTimeout(timer)
    if (!res.ok) return null
    const data: any = await res.json()
    const top = data?.results?.[0]
    const artworkUrl: string | undefined = top?.artworkUrl100
    if (!artworkUrl) return null

    // Sanity check: reject if the matched artist has nothing to do with the one we
    // searched for — a fuzzy text search with no result validation is how a jazz box
    // set ends up with a Charlie Brown Christmas cover.
    const resultArtist = String(top.artistName ?? '').toLowerCase()
    const queryArtist = artist.toLowerCase()
    if (resultArtist && queryArtist && !resultArtist.includes(queryArtist) && !queryArtist.includes(resultArtist)) {
      log('cover-art:rejected-mismatch', { artist, album, resultArtist, resultAlbum: top.collectionName })
      return null
    }

    const hiRes = artworkUrl.replace(/\d+x\d+bb\.(jpg|png)/, '1200x1200bb.$1')
    return await fetchImageBuffer(hiRes)
  } catch {
    return null
  }
}

function fetchAndSaveCoverArt(dir: string, artist: string, album: string): Promise<string | null> {
  const cached = coverArtCache.get(dir)
  if (cached) return cached
  const promise = (async () => {
    if (looksLikeJunkAlbumName(album, artist)) {
      log('cover-art:skipped-junk-album', { dir, artist, album })
      return null
    }
    log('cover-art:fetch', { dir, artist, album })
    const buf = await fetchAlbumCoverFromItunes(artist, album)
    if (!buf) { log('cover-art:not-found', { artist, album }); return null }
    try {
      fs.writeFileSync(path.join(dir, 'cover.jpg'), buf)
      log('cover-art:saved', { dir, bytes: buf.length })
      return `data:image/jpeg;base64,${buf.toString('base64')}`
    } catch (e) {
      log('cover-art:save-failed', { dir, error: String(e) })
      return null
    }
  })()
  coverArtCache.set(dir, promise)
  return promise
}

ipcMain.handle('read-metadata', async (_event, filePaths: string[]) => {
  const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp']
  const PRIORITY_NAMES = ['cover', 'folder', 'front', 'album', 'artwork', 'art', 'albumart']
  const dirArtCache = new Map<string, string | null>()

  const FILE_MIME: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.png': 'image/png', '.webp': 'image/webp',
  }

  function imageToDataUrl(imgPath: string): string | null {
    try {
      const buf = fs.readFileSync(imgPath)
      const mime = FILE_MIME[path.extname(imgPath).toLowerCase()] ?? 'image/jpeg'
      return `data:${mime};base64,${buf.toString('base64')}`
    } catch { return null }
  }

  function findFolderArt(dir: string): string | null {
    if (dirArtCache.has(dir)) return dirArtCache.get(dir) ?? null

    // 1. Priority filenames in same dir
    for (const name of PRIORITY_NAMES) {
      for (const ext of IMAGE_EXTS) {
        const p = path.join(dir, name + ext)
        if (fs.existsSync(p)) {
          const url = imageToDataUrl(p)
          dirArtCache.set(dir, url)
          return url
        }
      }
    }

    let entries: fs.Dirent[] = []
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch {}

    // 2. Images inside subdirectories (img/, images/, artwork/, scans/, etc.)
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      try {
        const subEntries = fs.readdirSync(path.join(dir, entry.name), { withFileTypes: true })
        for (const se of subEntries) {
          if (se.isFile() && IMAGE_EXTS.includes(path.extname(se.name).toLowerCase())) {
            const url = imageToDataUrl(path.join(dir, entry.name, se.name))
            if (url) { dirArtCache.set(dir, url); return url }
          }
        }
      } catch {}
    }

    // 3. Any image file in same dir
    for (const entry of entries) {
      if (entry.isFile() && IMAGE_EXTS.includes(path.extname(entry.name).toLowerCase())) {
        const url = imageToDataUrl(path.join(dir, entry.name))
        if (url) { dirArtCache.set(dir, url); return url }
      }
    }

    dirArtCache.set(dir, null)
    return null
  }

  const cache = loadMetadataCache()

  const results = await Promise.all(filePaths.map(async (filePath) => {
    try {
      const stat = fs.statSync(filePath)
      const cached = cache.tracks[filePath]

      // Cache hit — file is byte-for-byte what it was last time we parsed it,
      // so skip the ID3 parse and cover-art extraction entirely.
      if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
        return {
          path: filePath,
          title: cached.title,
          artist: cached.artist,
          album: cached.album,
          trackNumber: cached.trackNumber,
          duration: cached.duration,
          coverDataUrl: cached.coverHash ? cache.images[cached.coverHash] ?? null : null,
          year: cached.year,
          genre: cached.genre,
        }
      }

      const meta = await parseFile(filePath, { duration: true, skipCovers: false })
      let coverDataUrl: string | null = null

      // Embedded art first
      const pic = meta.common.picture?.[0]
      if (pic) {
        try {
          const b64 = Buffer.from(pic.data).toString('base64')
          coverDataUrl = `data:${pic.format};base64,${b64}`
        } catch { /* skip */ }
      }

      // Fallback: image file in folder or subfolder
      if (!coverDataUrl) coverDataUrl = findFolderArt(path.dirname(filePath))

      // Last resort: only reached when truly nothing local exists — fetch once per
      // album folder and save it there so every track (and future rescans) benefit.
      const artistName = meta.common.artist ?? meta.common.albumartist
      if (!coverDataUrl && artistName && meta.common.album) {
        coverDataUrl = await fetchAndSaveCoverArt(path.dirname(filePath), artistName, meta.common.album)
      }

      const result = {
        path: filePath,
        title: meta.common.title ?? null,
        artist: meta.common.artist ?? meta.common.albumartist ?? null,
        album: meta.common.album ?? null,
        trackNumber: meta.common.track?.no ?? null,
        duration: meta.format.duration ?? null,
        coverDataUrl,
        year: meta.common.year != null ? String(meta.common.year) : null,
        genre: meta.common.genre?.[0] ?? null,
      }

      cache.tracks[filePath] = {
        mtimeMs: stat.mtimeMs,
        size: stat.size,
        title: result.title,
        artist: result.artist,
        album: result.album,
        trackNumber: result.trackNumber,
        duration: result.duration,
        year: result.year,
        genre: result.genre,
        coverHash: internCover(cache, coverDataUrl),
      }
      scheduleMetadataCacheSave()

      return result
    } catch {
      return { path: filePath, title: null, artist: null, album: null, trackNumber: null, duration: null, coverDataUrl: null, year: null, genre: null }
    }
  }))
  return results
})

interface TagWriteUpdate {
  path: string
  title?: string
  artist?: string
  album?: string
  trackNumber?: string
  year?: string
  genre?: string
}

const FFMPEG_PATHS = ['ffmpeg', '/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg']

// App Sandbox forbids shelling out to a system `ffmpeg` (Homebrew/PATH binaries are outside
// the sandbox container). A sandboxed (MAS) build instead ships its own copy via
// electron-builder's `extraResources` (see package.json → build.mas.extraResources) landing
// at Contents/Resources/ffmpeg — check there first, and only fall back to the system search
// for the still-current non-MAS DMG build.
function findFfmpeg(): string {
  const bundled = path.join(process.resourcesPath, 'ffmpeg')
  try { if (fs.existsSync(bundled)) return bundled } catch {}
  for (const p of FFMPEG_PATHS) {
    try { if (p === 'ffmpeg' || fs.existsSync(p)) return p } catch {}
  }
  return 'ffmpeg'
}

// GUI apps launched from Finder don't inherit the shell PATH, so Homebrew's ffmpeg dirs are
// prepended on macOS. Windows is left untouched: its variable is `Path` with `;` separators,
// and adding a colon-joined `PATH` next to it would shadow the real one and hide ffmpeg.
function ffmpegEnv(): NodeJS.ProcessEnv {
  if (process.platform === 'win32') return process.env
  return { ...process.env, PATH: `/opt/homebrew/bin:/usr/local/bin:/usr/bin:${process.env.PATH}` }
}

function writeTagsFfmpeg(update: TagWriteUpdate): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const bin = findFfmpeg()
    const ext = path.extname(update.path)
    const tmpPath = update.path.slice(0, -ext.length) + '__tagtmp' + ext
    const args = ['-y', '-i', update.path, '-map', '0', '-c', 'copy']
    if (update.title !== undefined) args.push('-metadata', `title=${update.title}`)
    if (update.artist !== undefined) args.push('-metadata', `artist=${update.artist}`)
    if (update.album !== undefined) args.push('-metadata', `album=${update.album}`)
    if (update.trackNumber !== undefined) args.push('-metadata', `track=${update.trackNumber}`)
    if (update.year !== undefined) args.push('-metadata', `date=${update.year}`)
    if (update.genre !== undefined) args.push('-metadata', `genre=${update.genre}`)
    args.push(tmpPath)
    const env = ffmpegEnv()
    const proc = spawn(bin, args, { env })
    let errOut = ''
    proc.stderr.on('data', (d: Buffer) => { errOut += d })
    proc.on('close', (code) => {
      if (code !== 0) {
        try { fs.unlinkSync(tmpPath) } catch {}
        resolve({ success: false, error: errOut.trim() || 'ffmpeg failed' })
        return
      }
      try {
        fs.renameSync(tmpPath, update.path)
        resolve({ success: true })
      } catch (e: any) {
        try { fs.unlinkSync(tmpPath) } catch {}
        resolve({ success: false, error: e.message })
      }
    })
    proc.on('error', (e: Error) => resolve({ success: false, error: `ffmpeg not found: ${e.message}` }))
  })
}

function checkFfmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const bin = findFfmpeg()
    const env = ffmpegEnv()
    const proc = spawn(bin, ['-version'], { env })
    proc.on('error', () => resolve(false))
    proc.on('close', (code) => resolve(code === 0))
  })
}

ipcMain.handle('check-ffmpeg', () => checkFfmpegAvailable())

// A conversion batch can be cancelled mid-flight from the renderer (see 'cancel-convert').
// currentConvertProc lets that cancel actually kill the in-progress ffmpeg process instead
// of just refusing to start the next one.
let currentConvertProc: ChildProcess | null = null
let convertCancelled = false

ipcMain.handle('cancel-convert', () => {
  log('cancel-convert requested')
  convertCancelled = true
  if (currentConvertProc) { try { currentConvertProc.kill() } catch { /* already exiting */ } }
  return true
})

// Runs one ffmpeg invocation and resolves with its exit code plus captured stderr,
// keeping currentConvertProc in sync so a mid-batch cancel can still kill it.
function runFfmpeg(bin: string, args: string[], env: NodeJS.ProcessEnv): Promise<{ code: number | null; errOut: string }> {
  return new Promise((resolve) => {
    const proc = spawn(bin, args, { env })
    currentConvertProc = proc
    let errOut = ''
    proc.stderr.on('data', (d: Buffer) => { errOut += d })
    proc.on('close', (code) => { currentConvertProc = null; resolve({ code, errOut }) })
    proc.on('error', (e: Error) => { currentConvertProc = null; resolve({ code: null, errOut: `ffmpeg not found: ${e.message}` }) })
  })
}

// Convert a lossless (FLAC/WAV) file to MP3 next to the original, preserving all
// metadata tags and embedded cover art via ffmpeg's stream/metadata copy.
//
// Some rips carry a broken "cover art" picture stream (e.g. an HTML error page saved
// with a .png extension instead of an actual image) which makes ffmpeg's mp3 muxer
// refuse to write the file at all ("Could not write header ... Invalid argument"),
// even though the audio itself is perfectly fine. Rather than fail the whole track,
// fall back to converting without the picture stream when the first attempt fails.
async function convertToMp3One(srcPath: string): Promise<{ path: string; success: boolean; error?: string }> {
  const dir = path.dirname(srcPath)
  const base = path.basename(srcPath, path.extname(srcPath))
  let destPath = path.join(dir, `${base}.mp3`)
  let counter = 1
  while (fs.existsSync(destPath)) {
    destPath = path.join(dir, `${base} (${counter}).mp3`)
    counter++
  }
  const bin = findFfmpeg()
  const env = ffmpegEnv()
  const buildArgs = (withCover: boolean) => [
    '-y',
    '-i', srcPath,
    '-map', '0:a',
    ...(withCover ? ['-map', '0:v?'] : []),
    '-c:a', 'libmp3lame',
    '-q:a', '0',
    ...(withCover ? ['-c:v', 'copy'] : []),
    '-map_metadata', '0',
    '-id3v2_version', '3',
    destPath,
  ]

  let { code, errOut } = await runFfmpeg(bin, buildArgs(true), env)
  if (code !== 0) {
    const coverErr = errOut
    try { fs.unlinkSync(destPath) } catch { /* nothing written */ }
    log('convert:file:retry-without-cover', { srcPath, error: coverErr.trim().slice(-300) })
    ;({ code, errOut } = await runFfmpeg(bin, buildArgs(false), env))
    if (code !== 0) {
      try { fs.unlinkSync(destPath) } catch { /* nothing written */ }
      return { path: srcPath, success: false, error: errOut.trim().slice(-500) || coverErr.trim().slice(-500) || 'ffmpeg failed' }
    }
  }
  return { path: destPath, success: true }
}

// Cue sheet support: a whole album is often ripped as a single FLAC/WAV file with a
// companion .cue file describing track boundaries. We parse that instead of guessing
// splits from silence, and split+tag each track individually when converting.
interface CueTrack { trackNo: number; title: string; performer: string; startSec: number }
interface CueSheet { albumTitle?: string; albumPerformer?: string; date?: string; genre?: string; tracks: CueTrack[] }

function tokenizeCueLine(rest: string): string[] {
  const tokens: string[] = []
  const re = /"([^"]*)"|(\S+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(rest))) tokens.push(m[1] ?? m[2])
  return tokens
}

function parseCue(text: string): CueSheet {
  const lines = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).split(/\r?\n/)
  const sheet: CueSheet = { tracks: [] }
  let currentTrack: Partial<CueTrack> | null = null
  let currentIndex01: number | null = null

  const finalizeTrack = () => {
    if (currentTrack && currentTrack.trackNo != null && currentIndex01 != null) {
      sheet.tracks.push({
        trackNo: currentTrack.trackNo,
        title: currentTrack.title || `Track ${currentTrack.trackNo}`,
        performer: currentTrack.performer || sheet.albumPerformer || '',
        startSec: currentIndex01,
      })
    }
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    const spaceIdx = line.indexOf(' ')
    const command = (spaceIdx === -1 ? line : line.slice(0, spaceIdx)).toUpperCase()
    const rest = spaceIdx === -1 ? '' : line.slice(spaceIdx + 1).trim()

    if (command === 'PERFORMER') {
      const val = tokenizeCueLine(rest)[0] ?? ''
      if (currentTrack) currentTrack.performer = val
      else sheet.albumPerformer = val
    } else if (command === 'TITLE') {
      const val = tokenizeCueLine(rest)[0] ?? ''
      if (currentTrack) currentTrack.title = val
      else sheet.albumTitle = val
    } else if (command === 'TRACK') {
      finalizeTrack()
      const trackNo = parseInt(tokenizeCueLine(rest)[0], 10)
      currentTrack = Number.isFinite(trackNo) ? { trackNo } : null
      currentIndex01 = null
    } else if (command === 'INDEX') {
      const parts = tokenizeCueLine(rest)
      const indexNo = parseInt(parts[0], 10)
      const time = parts[1]
      if (indexNo === 1 && time) {
        const m = /^(\d+):(\d+):(\d+)$/.exec(time)
        if (m) currentIndex01 = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + parseInt(m[3], 10) / 75
      }
    } else if (command === 'REM') {
      const parts = tokenizeCueLine(rest)
      const key = parts[0]?.toUpperCase()
      if (key === 'DATE') sheet.date = parts[1]
      if (key === 'GENRE') sheet.genre = parts.slice(1).join(' ')
    }
  }
  finalizeTrack()
  sheet.tracks.sort((a, b) => a.trackNo - b.trackNo)
  return sheet
}

// Listing a directory's .cue files and parsing them is not free — with hundreds of
// tracks in one folder, doing it once per audio file (the naive approach) turned into
// the main process being blocked for minutes, which read as the whole app "hanging."
// These caches make it O(directories) + O(cue files) instead of O(audio files).
const dirCueFilesCache = new Map<string, string[]>()
const parsedCueCache = new Map<string, CueSheet>()

function listCueFilesInDir(dir: string): string[] {
  const cached = dirCueFilesCache.get(dir)
  if (cached) return cached
  let result: string[] = []
  try {
    result = fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && path.extname(e.name).toLowerCase() === '.cue')
      .map((e) => path.join(dir, e.name))
  } catch { /* unreadable dir */ }
  dirCueFilesCache.set(dir, result)
  return result
}

function findCompanionCue(audioPath: string): string | null {
  const dir = path.dirname(audioPath)
  const base = path.basename(audioPath, path.extname(audioPath)).toLowerCase()
  const cueFiles = listCueFilesInDir(dir)
  const direct = cueFiles.find((f) => path.basename(f, '.cue').toLowerCase() === base)
  if (direct) return direct
  for (const full of cueFiles) {
    try {
      const text = fs.readFileSync(full, 'utf-8')
      const m = /FILE\s+"([^"]+)"/i.exec(text)
      if (m && path.basename(m[1]).toLowerCase() === path.basename(audioPath).toLowerCase()) return full
    } catch { /* unreadable cue, skip */ }
  }
  return null
}

function cueSheetFor(audioPath: string): CueSheet | null {
  const cuePath = findCompanionCue(audioPath)
  if (!cuePath) return null
  let sheet = parsedCueCache.get(cuePath)
  if (!sheet) {
    try {
      sheet = parseCue(fs.readFileSync(cuePath, 'utf-8'))
      parsedCueCache.set(cuePath, sheet)
    } catch {
      return null
    }
  }
  return sheet.tracks.length >= 2 ? sheet : null
}

// Yields back to the event loop periodically so a huge batch (thousands of files from
// a folder import) never blocks IPC / window responsiveness for more than a few ms at a time.
async function yieldEvery(i: number, every = 40) {
  if (i > 0 && i % every === 0) await new Promise((r) => setImmediate(r))
}

ipcMain.handle('get-cue-info', async (_event, filePaths: string[]) => {
  const t0 = Date.now()
  log('get-cue-info:start', { count: filePaths.length })
  const result: Record<string, { trackCount: number; albumTitle?: string } | null> = {}
  for (let i = 0; i < filePaths.length; i++) {
    const p = filePaths[i]
    const sheet = cueSheetFor(p)
    result[p] = sheet ? { trackCount: sheet.tracks.length, albumTitle: sheet.albumTitle } : null
    await yieldEvery(i)
  }
  log('get-cue-info:done', { count: filePaths.length, ms: Date.now() - t0 })
  return result
})

// Split one cue-mapped source file into per-track MP3s, tagging each from the cue sheet.
async function splitAndConvertByCue(
  srcPath: string,
  sheet: CueSheet,
  onTrackDone: (label: string) => void
): Promise<{ mp3Paths: string[]; allOk: boolean; error?: string }> {
  const dir = path.dirname(srcPath)
  const bin = findFfmpeg()
  const env = ffmpegEnv()

  let coverPath: string | null = null
  try {
    const meta = await parseFile(srcPath, { skipCovers: false })
    const pic = meta.common.picture?.[0]
    if (pic) {
      const ext = pic.format.toLowerCase().includes('png') ? '.png' : '.jpg'
      coverPath = path.join(app.getPath('temp'), `espresso-cue-cover-${process.pid}-${Date.now()}${ext}`)
      fs.writeFileSync(coverPath, Buffer.from(pic.data))
    }
  } catch { /* no embedded art — tracks will just have no cover */ }

  const mp3Paths: string[] = []
  try {
    for (let i = 0; i < sheet.tracks.length; i++) {
      if (convertCancelled) { onTrackDone('cancelled'); break }
      const track = sheet.tracks[i]
      const next = sheet.tracks[i + 1]
      const duration = next ? Math.max(next.startSec - track.startSec, 0.05) : null

      const safeTitle = (track.title || `Track ${track.trackNo}`).replace(/[/\\:*?"<>|]/g, '_').trim() || `Track ${track.trackNo}`
      const numPrefix = String(track.trackNo).padStart(2, '0')
      let destPath = path.join(dir, `${numPrefix} - ${safeTitle}.mp3`)
      let counter = 1
      while (fs.existsSync(destPath)) {
        destPath = path.join(dir, `${numPrefix} - ${safeTitle} (${counter}).mp3`)
        counter++
      }

      const args = ['-y', '-ss', String(track.startSec), '-i', srcPath]
      if (coverPath) args.push('-i', coverPath)
      args.push('-map', '0:a')
      if (coverPath) args.push('-map', '1:v', '-c:v', 'copy', '-disposition:v', 'attached_pic')
      args.push('-c:a', 'libmp3lame', '-q:a', '0')
      if (duration != null) args.push('-t', String(duration))
      args.push('-metadata', `title=${track.title}`)
      args.push('-metadata', `artist=${track.performer || sheet.albumPerformer || ''}`)
      if (sheet.albumPerformer) args.push('-metadata', `album_artist=${sheet.albumPerformer}`)
      if (sheet.albumTitle) args.push('-metadata', `album=${sheet.albumTitle}`)
      args.push('-metadata', `track=${track.trackNo}`)
      if (sheet.date) args.push('-metadata', `date=${sheet.date}`)
      if (sheet.genre) args.push('-metadata', `genre=${sheet.genre}`)
      args.push('-id3v2_version', '3')
      args.push(destPath)

      const ok = await new Promise<boolean>((resolve) => {
        const proc = spawn(bin, args, { env })
        currentConvertProc = proc
        proc.on('close', (code) => { currentConvertProc = null; resolve(code === 0) })
        proc.on('error', () => { currentConvertProc = null; resolve(false) })
      })
      if (!ok) {
        try { fs.unlinkSync(destPath) } catch { /* nothing written */ }
        onTrackDone(`${safeTitle} (failed)`)
        continue
      }
      mp3Paths.push(destPath)
      onTrackDone(safeTitle)
    }
  } finally {
    if (coverPath) { try { fs.unlinkSync(coverPath) } catch { /* ignore */ } }
  }

  if (mp3Paths.length === 0) return { mp3Paths: [], allOk: false, error: 'All tracks failed to convert' }
  const failedCount = sheet.tracks.length - mp3Paths.length
  if (failedCount > 0) {
    return { mp3Paths, allOk: false, error: `${failedCount} of ${sheet.tracks.length} tracks failed to convert` }
  }
  return { mp3Paths, allOk: true }
}

interface ConvertResult { originalPath: string; mp3Paths: string[]; success: boolean; error?: string }

ipcMain.handle('convert-to-mp3', async (event, filePaths: string[], options: { deleteOriginal?: boolean }) => {
  convertCancelled = false
  const batchStart = Date.now()
  log('convert-to-mp3:start', { count: filePaths.length, deleteOriginal: !!options?.deleteOriginal })

  const cueByPath = new Map<string, CueSheet | null>()
  for (let i = 0; i < filePaths.length; i++) {
    cueByPath.set(filePaths[i], cueSheetFor(filePaths[i]))
    await yieldEvery(i)
  }
  const total = filePaths.reduce((sum, p) => sum + (cueByPath.get(p)?.tracks.length ?? 1), 0)
  let done = 0

  const results: ConvertResult[] = []
  for (const srcPath of filePaths) {
    if (convertCancelled) {
      log('convert-to-mp3:cancelled', { at: path.basename(srcPath), done, total })
      break
    }
    const fileStart = Date.now()
    const sheet = cueByPath.get(srcPath)
    if (sheet) {
      log('convert:album:start', { srcPath, trackCount: sheet.tracks.length })
      const { mp3Paths, allOk, error } = await splitAndConvertByCue(srcPath, sheet, (label) => {
        done++
        event.sender.send('convert-progress', { done, total, file: label })
      })
      if (allOk && options?.deleteOriginal) {
        try { fs.unlinkSync(srcPath) } catch (e) { log('convert:album:delete-failed', { srcPath, error: String(e) }) }
        const cuePath = findCompanionCue(srcPath)
        if (cuePath) { try { fs.unlinkSync(cuePath) } catch { /* ignore */ } }
      }
      log('convert:album:done', { srcPath, tracksOk: mp3Paths.length, allOk, error, ms: Date.now() - fileStart })
      results.push({ originalPath: srcPath, mp3Paths, success: mp3Paths.length > 0, error })
      continue
    }

    log('convert:file:start', { srcPath })
    const r = await convertToMp3One(srcPath)
    if (r.success && options?.deleteOriginal) {
      try { fs.unlinkSync(srcPath) } catch (e) { log('convert:file:delete-failed', { srcPath, error: String(e) }) }
    }
    log('convert:file:done', { srcPath, success: r.success, error: r.error, ms: Date.now() - fileStart })
    results.push({ originalPath: srcPath, mp3Paths: r.success ? [r.path] : [], success: r.success, error: r.error })
    done++
    event.sender.send('convert-progress', { done, total, file: path.basename(srcPath) })
  }

  log('convert-to-mp3:done', {
    processed: results.length, of: filePaths.length,
    succeeded: results.filter((r) => r.success).length,
    ms: Date.now() - batchStart,
  })
  return results
})

ipcMain.handle('write-tags', async (_event, updates: TagWriteUpdate[]) => {
  const results: Array<{ path: string; success: boolean; error?: string }> = []
  for (const update of updates) {
    const ext = path.extname(update.path).toLowerCase()
    if (ext === '.mp3') {
      try {
        const tags: NodeID3.Tags = {}
        if (update.title !== undefined) tags.title = update.title
        if (update.artist !== undefined) tags.artist = update.artist
        if (update.album !== undefined) tags.album = update.album
        if (update.trackNumber !== undefined) tags.trackNumber = update.trackNumber
        if (update.year !== undefined) tags.year = update.year
        if (update.genre !== undefined) tags.genre = update.genre
        const result = NodeID3.update(tags, update.path)
        results.push({ path: update.path, success: result === true, error: result !== true ? String(result) : undefined })
      } catch (e: any) {
        results.push({ path: update.path, success: false, error: e.message })
      }
    } else {
      const result = await writeTagsFfmpeg(update)
      results.push({ path: update.path, ...result })
    }
  }
  return results
})
