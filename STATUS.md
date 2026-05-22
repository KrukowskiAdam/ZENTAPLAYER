# ZentaPlayer — Status

## Sesja 2 (2026-05-19) — zrobione dziś

### Naprawione

- [x] **Audio loading** — porzucono `localfile://` custom protocol (blokowany przez CORS w dev mode). Przejście na IPC: `ipcMain.handle('read-audio-file')` czyta plik jako Buffer, renderer tworzy `Blob URL` i przekazuje do WaveSurfer. Działa.
- [x] **Preload rebuild** — `npm run dev` teraz kompiluje `tsconfig.main.json` przed startem Electrona (hotfix na stary `dist/main/preload.js`)
- [x] **Speed control z pitch preservation** — presety `0.5×` `0.75×` `1×` `1.25×` + slider fine-control (0.25–1.5×). Używa `ws.setPlaybackRate(speed, true)` — Chromium WSOLA. Wystarcza dla 50–100% range. SoundTouch WASM można dołożyć później.
- [x] **React border shorthand warning** — naprawiono mieszanie `border` + `borderColor` w style objects

### Nowe features

- [x] **Dual waveform → single focused waveform** — `LoopEditorPanel` jest teraz jedynym i głównym odtwarzaczem (waveform + audio engine). `WaveformView` usunięty z drzewa.
- [x] **Nowy layout (Winamp-style):**
  ```
  ┌──────────────────────────────────┐
  │  titlebar                        │
  ├──────────────────────────────────┤
  │  playlist  (flex: 1, full width) │  ← id="playlist-section"
  ├──────────────────────────────────┤
  │  waveform + loop editor (200px)  │  ← id="waveform-section"
  ├──────────────────────────────────┤
  │  transport bar (52px)            │  ← id="transport-bar"
  └──────────────────────────────────┘
  ```
- [x] **ID na wszystkich głównych divach** — łatwe wskazywanie w rozmowie (patrz lista poniżej)
- [x] **Blob URL cleanup** — `URL.revokeObjectURL` przy zmianie tracku (brak memory leak)
- [x] **Auto-zoom do loop regionu** — po zaznaczeniu regionu, waveform automatycznie zoomuje żeby loop wypełnił widok (+ 25% padding). `ws.setScrollTime()` scrolluje do loop start.

---

## ID głównych elementów UI

| ID | Co to jest |
|---|---|
| `app-root` | Cały wrapper aplikacji |
| `titlebar` | Pasek tytułu (drag area) |
| `playlist-section` | Sekcja z playlistą (flex:1, górna) |
| `sidebar` | Lista tracków (full width) |
| `sidebar-header` | Nagłówek playlisty (tytuł + przycisk +) |
| `sidebar-add-btn` | Przycisk dodawania plików |
| `sidebar-list` | Scrollowalna lista tracków |
| `waveform-section` | Sekcja z waveformem (200px, dolna) |
| `loop-editor` | Cały panel waveformu/loop editora |
| `loop-editor-header` | Header (nazwa tracku, czasy loopa) |
| `loop-editor-canvas` | Kontener WaveSurfer |
| `transport-bar` | Pasek transportu |
| `transport-play` | Przycisk play/pause |
| `transport-loop` | Przycisk toggle loop |
| `transport-speed` | Grupa speed (presety + slider) |
| `transport-seekbar` | Pasek seekowania |
| `transport-right` | Prawa część (czas + głośność) |

---

## Wspólny słownik — nazwy własne w kodzie

### Biblioteki zewnętrzne

| Nazwa | Co to jest |
|---|---|
| **WaveSurfer** | Biblioteka JS rysująca waveform (falę dźwiękową) i obsługująca odtwarzanie audio. Instancja to `ws` lub `wsRef.current` w kodzie. |
| **RegionsPlugin** | Plugin do WaveSurfer — umożliwia zaznaczanie i wyświetlanie regionów (kolorowych prostokątów) na waveformie. Używany do loop regionu. |
| **Electron** | Framework zamieniający aplikację webową (React) w desktopową aplikację dla macOS/Windows/Linux. Składa się z `main process` i `renderer process`. |
| **Vite** | Bundler/dev server — kompiluje i serwuje kod renderera (React/TypeScript) na `localhost:5173` podczas developmentu. |
| **music-metadata** | Biblioteka Node.js do odczytu tagów audio (ID3, Vorbis, MP4) — artysta, album, tytuł, okładka, długość utworu. |

### Architektura Electron

| Nazwa | Co to jest |
|---|---|
| **main process** | Proces Node.js — plik `src/main/main.ts`. Dostęp do systemu plików, dialogów, protokołów. |
| **renderer process** | Proces z React UI — folder `src/renderer/`. Działa jak przeglądarka, bez bezpośredniego dostępu do systemu. |
| **preload** | Plik `src/main/preload.ts` — most między main i renderer. Eksponuje bezpieczne API (`window.electronAPI`). |
| **IPC** | Inter-Process Communication — mechanizm komunikacji main ↔ renderer. `ipcMain.handle` + `ipcRenderer.invoke`. |
| **electronAPI** | Obiekt na `window.electronAPI` w rendererze — zawiera: `openFiles()`, `openFolder()`, `readAudioFile()`, `readMetadata()`. |

### Komponenty React

| Nazwa | Co to jest |
|---|---|
| **App** | Główny komponent (`App.tsx`) — trzyma cały stan (`tracks`, `activeTrack`, `player`), globalny keyboard handler. |
| **Sidebar** | Lista utworów po lewej — kolumny (artist/album/title/czas/okładka), grupowanie po albumie. |
| **LoopEditorPanel** | Panel z waveformem i loop editorem — tu żyje instancja WaveSurfer, regiony, odtwarzanie. |
| **Transport** | Dolny pasek — play/pause, seek bar, speed, volume, czas. |

### Stan aplikacji

| Nazwa | Co to jest |
|---|---|
| **PlayerState** | Obiekt stanu odtwarzacza: `playing`, `currentTime`, `duration`, `volume`, `speed`, `loopEnabled`, `loopStart`, `loopEnd`, `seekTo`. |
| **Track** | Obiekt reprezentujący utwór: `id`, `path`, `name`, `artist`, `album`, `title`, `trackNumber`, `duration`, `coverDataUrl`. |
| **seekTo** | Pole w `PlayerState` — gdy ustawione (nie `null`), LoopEditorPanel wywołuje `ws.setTime()` i resetuje do `null`. Mechanizm zewnętrznego seekowania. |
| **activeTrack** | Aktualnie wybrany utwór (`Track | null`). Zmiana powoduje załadowanie nowego audio do WaveSurfer. |

### Funkcje WaveSurfer używane w kodzie

| Wywołanie | Co robi |
|---|---|
| `ws.play()` | Startuje odtwarzanie od bieżącej pozycji |
| `ws.pause()` | Pauzuje odtwarzanie |
| `ws.setTime(t)` | Przesuwa playhead (zieloną linię) do czasu `t` w sekundach |
| `ws.setVolume(v)` | Ustawia głośność (0.0–1.0) |
| `ws.setPlaybackRate(r, true)` | Ustawia prędkość odtwarzania z zachowaniem wysokości dźwięku (pitch preservation) |
| `ws.zoom(px)` | Ustawia zoom waveformu — piksele na sekundę |
| `ws.getDuration()` | Zwraca długość załadowanego audio w sekundach |
| `ws.isPlaying()` | Zwraca `true` jeśli aktualnie gra |
| `ws.destroy()` | Niszczy instancję (cleanup przy zmianie tracku) |
| `regions.enableDragSelection(opts)` | Włącza rysowanie regionu myszą (klik+drag na waveformie) |

---

## Stack

- Electron 41 + Vite 8 + React 19 + TypeScript
- WaveSurfer.js 7.12.7 (waveform + regions plugin)
- Brak zewnętrznego CSS frameworka (czyste CSS variables, dark DAW theme)

## Uruchomienie

```bash
npm run dev
# kompiluje main/preload (tsc) → startuje Vite renderer → startuje Electron
```

---

## Do zrobienia (następna sesja)

### MVP priorytet

- [ ] **Hotkeys** — spacja play/pause, `L` toggle loop, `←/→` seek o 5s, `[` ustaw loop start na playhead, `]` ustaw loop end
- [ ] **Drag & drop** plików na playlist (zamiast tylko file picker)
- [ ] **Resize waveform section** — przeciągany divider między playlist a waveform
- [ ] **Pitch display** — pokaż aktualną wartość speed w nagłówku waveformu

### Jakość audio

- [ ] **SoundTouch WASM** — lepsza jakość time-stretching przy <75% speed (zastąpi natywne browser WSOLA które brzmi średnio przy dużym spowolnieniu)
- [ ] Biblioteka: `soundtouch-audio-worklet` lub `rubberband-wasm`

### UI / UX

- [ ] Playlist: pokaż długość tracku (MM:SS) w wierszu
- [ ] Playlist: prawy klik → remove track
- [ ] Waveform: zoom in/out scrollem myszy
- [ ] Session save — zapamiętaj playlistę między sesjami (electron-store lub JSON do AppData)
- [ ] Markers — możliwość dodawania nazwanych punktów na waveformie

### Pakowanie

- [ ] electron-builder config → `.dmg` dla macOS
- [ ] Ikona aplikacji
- [ ] Auto-updater (electron-updater)
