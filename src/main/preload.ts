import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  openFiles: () => ipcRenderer.invoke('open-files'),
  openFolder: () => ipcRenderer.invoke('open-folder'),
  readAudioFile: (filePath: string): Promise<Uint8Array> => ipcRenderer.invoke('read-audio-file', filePath),
  readMetadata: (filePaths: string[]) => ipcRenderer.invoke('read-metadata', filePaths),
  loadLibrary: (): Promise<string[]> => ipcRenderer.invoke('load-library'),
  saveLibrary: (paths: string[]) => ipcRenderer.invoke('save-library', paths),
})
