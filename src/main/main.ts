import { app, BrowserWindow, ipcMain, dialog, protocol } from 'electron'
import path from 'path'
import fs from 'fs'
import { parseFile } from 'music-metadata'

const isDev = !app.isPackaged

// Register custom protocol for local file access from renderer
protocol.registerSchemesAsPrivileged([
  { scheme: 'localfile', privileges: { secure: true, supportFetchAPI: true, stream: true } },
])

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0f0f0f',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  // Serve local audio files via localfile:// protocol
  protocol.handle('localfile', async (request) => {
    const raw = request.url.slice('localfile://'.length)
    const filePath = decodeURIComponent(raw)
    const ext = path.extname(filePath).toLowerCase().slice(1)
    const mime: Record<string, string> = {
      mp3: 'audio/mpeg', flac: 'audio/flac', wav: 'audio/wav',
      ogg: 'audio/ogg', aac: 'audio/aac', m4a: 'audio/mp4',
    }
    const data = fs.readFileSync(filePath)
    return new Response(data, {
      headers: { 'Content-Type': mime[ext] ?? 'audio/mpeg' },
    })
  })

  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

ipcMain.handle('open-files', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Audio', extensions: ['mp3', 'flac', 'wav', 'ogg', 'aac', 'm4a'] }],
  })
  return result.filePaths
})

ipcMain.handle('open-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'multiSelections'],
  })
  if (result.canceled || !result.filePaths.length) return []

  const audioExts = new Set(['.mp3', '.flac', '.wav', '.ogg', '.aac', '.m4a'])
  const found: string[] = []

  function scanDir(dir: string) {
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        scanDir(full)
      } else if (audioExts.has(path.extname(entry.name).toLowerCase())) {
        found.push(full)
      }
    }
  }

  for (const folderPath of result.filePaths) scanDir(folderPath)
  found.sort()
  return found
})

ipcMain.handle('read-audio-file', (_event, filePath: string) => {
  return fs.readFileSync(filePath)
})

type SavedStream = { url: string; name: string }
type SavedPlaylist = { id: string; name: string; paths: string[]; streams?: SavedStream[] }
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
      playlists: data.playlists.map((p) => ({
        id: p.id,
        name: p.name,
        paths: (p.paths ?? []).filter((fp: unknown) => typeof fp === 'string' && fs.existsSync(fp as string)),
        streams: (p.streams ?? []).filter((s: unknown) => {
          if (typeof s !== 'object' || s === null) return false
          return isHttpUrl((s as any).url)
        }),
      })),
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

  const results = await Promise.all(filePaths.map(async (filePath) => {
    try {
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

      return {
        path: filePath,
        title: meta.common.title ?? null,
        artist: meta.common.artist ?? meta.common.albumartist ?? null,
        album: meta.common.album ?? null,
        trackNumber: meta.common.track?.no ?? null,
        duration: meta.format.duration ?? null,
        coverDataUrl,
      }
    } catch {
      return { path: filePath, title: null, artist: null, album: null, trackNumber: null, duration: null, coverDataUrl: null }
    }
  }))
  return results
})
