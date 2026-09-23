import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  openFiles: () => ipcRenderer.invoke('open-files'),
  openFolder: (): Promise<{ folders: string[]; files: string[] }> => ipcRenderer.invoke('open-folder'),
  scanPaths: (paths: string[]): Promise<string[]> => ipcRenderer.invoke('scan-paths', paths),
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  readAudioFile: (filePath: string): Promise<Uint8Array> => ipcRenderer.invoke('read-audio-file', filePath),
  showInFolder: (filePath: string) => ipcRenderer.invoke('show-in-folder', filePath),
  readMetadata: (filePaths: string[]) => ipcRenderer.invoke('read-metadata', filePaths),
  loadLibrary: (): Promise<string[]> => ipcRenderer.invoke('load-library'),
  saveLibrary: (paths: string[]) => ipcRenderer.invoke('save-library', paths),
  writeTags: (updates: any[]) => ipcRenderer.invoke('write-tags', updates),
  checkFfmpeg: (): Promise<boolean> => ipcRenderer.invoke('check-ffmpeg'),
  getCueInfo: (filePaths: string[]): Promise<Record<string, { trackCount: number; albumTitle?: string } | null>> =>
    ipcRenderer.invoke('get-cue-info', filePaths),
  convertToMp3: (
    filePaths: string[],
    options: { deleteOriginal?: boolean }
  ): Promise<Array<{ originalPath: string; mp3Paths: string[]; success: boolean; error?: string }>> =>
    ipcRenderer.invoke('convert-to-mp3', filePaths, options),
  cancelConvert: (): Promise<boolean> => ipcRenderer.invoke('cancel-convert'),
  onConvertProgress: (callback: (progress: { done: number; total: number; file: string }) => void) => {
    const listener = (_event: unknown, progress: { done: number; total: number; file: string }) => callback(progress)
    ipcRenderer.on('convert-progress', listener)
    return () => ipcRenderer.removeListener('convert-progress', listener)
  },
  onMenuAction: (channel: string, callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },
})
