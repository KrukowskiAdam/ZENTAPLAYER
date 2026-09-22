# ZentaPlayer — Status

## Sesja 5 (2026-09-22) — push do GitHub, build Windows, open source + wniosek SignPath

### Zrobione

- [x] **Cała praca z sesji 1-3 (nigdy niezacommitowana) wypchnięta na GitHub**
  (`github.com/KrukowskiAdam/ZENTAPLAYER`) w 4 commitach: rebranding +
  konfiguracja signing/CI, poprawki błędów + nowe funkcje (pitch-preserving
  speed, tag editor), changelog/roadmap/website assets, i osobno DNS fix.
  Wcześniej na koncie GitHub był tylko bardzo stary "Initial commit" —
  reszta siedziała jako niezacommitowane zmiany lokalnie.
- [x] **`.gitignore`** rozszerzony o `.DS_Store`, `log.txt`, `_MISC/` (osobisty
  folder roboczy z plikiem `.psd` i zrzutami ekranu, nie część projektu).
- [x] **CI (`.github/workflows/build.yml`) naprawione — build Windows/Mac
  teraz faktycznie przechodzi.** Dwie kolejne przyczyny awarii:
  1. `GH_TOKEN` w env kroków `build-mac`/`build-win` — niepotrzebny, bo
     publikacją zajmuje się osobny job `release`. Usunięty.
  2. Mimo usunięcia tokena, `electron-builder` **sam wykrywa git tag
     pasujący do wersji i próbuje publikować** ("Implicit publishing
     triggered by git tag") niezależnie od obecności tokena, i wywala się
     bo tokena faktycznie nie ma. Naprawione dodaniem `--publish=never` do
     wszystkich skryptów `dist*` w `package.json`. Sam `.dmg`/`.exe` budowały
     się poprawnie przez cały czas — padał tylko ten zbędny krok publikacji.
  - Po naprawie: pierwszy udany release
    [`v1.0.0`](https://github.com/KrukowskiAdam/ZENTAPLAYER/releases/tag/v1.0.0)
    z plikami `Espresso Player-1.0.0-arm64.dmg`, `Espresso Player-1.0.0.dmg`,
    `Espresso Player Setup 1.0.0.exe` — Windows buduje się automatycznie na
    `windows-latest` runnerze GitHuba, bez potrzeby posiadania Windowsa.
- [x] **Przycisk "Download for Windows" na stronie** — podmieniony z
  placeholdera "Coming soon" na link do `.exe` z GitHub Release. Z uwagą
  że installer jest niepodpisany i Windows SmartScreen może ostrzec.
- [x] **Projekt przeszedł na open source (MIT)** jako warunek kwalifikacji
  do darmowego Windows code-signing przez SignPath Foundation
  (signpath.org — podpisuje za darmo projekty open-source, weryfikując że
  binarka powstała z publicznego repo, zamiast tożsamości osoby):
  - Dodany `LICENSE` (MIT), `README.md`, `CODE_SIGNING.md` (wymagana przez
    SignPath jawna polityka podpisywania).
  - `package.json`: `license` z `"ISC"` (bez pliku LICENSE, czyli
    prawnie nieustalone) na `"MIT"`, uzupełniony `description` i `author`.
  - **Usunięty font "Command Override"** (`assets/font/`,
    `src/renderer/public/fonts/`) — znaleziony przy okazji audytu pod kątem
    "brak komponentów proprietarnych": font ma licencję *"free for
    non-commercial use only"*, a przy tym **nie był w ogóle używany** (UI
    faktycznie ładuje Michroma z Google Fonts). Build zweryfikowany że
    dalej działa po usunięciu.
  - Strona (`website/index.html`) — dodana wzmianka o SignPath Foundation
    przy przycisku Windows (wymóg formularza: "Download URL must mention
    that the project uses SignPath Foundation for code signing").
- [x] **Wniosek do SignPath Foundation złożony** (signpath.org/apply,
  2026-09-22) — Maintainer Type: Individual, Build System: GitHub Actions,
  Primary Discovery Channel: AI/LLM tools. Pole "Reputation" wypełnione
  **uczciwie** jako nowo wydany projekt solo-dev bez jeszcze zebranych
  dowodów popularności (żadnych fałszywych claimów) — świadome ryzyko że
  to może skutkować odrzuceniem, bo program celuje w ugruntowane projekty.
  Status: **czekamy na odpowiedź mailową** na krukowski.adam@gmail.com.

### Decyzja użytkownika — ważne na przyszłość

- **Użytkownik nie zapłaci za certyfikat OV/EV code-signing** (~$220+/rok)
  pod żadnym pozorem. Jeśli SignPath odrzuci wniosek albo nie odpowie —
  **zostawiamy jak jest**: `.exe` dalej niepodpisany, z ostrzeżeniem
  SmartScreen na stronie. Nie proponować ponownie płatnej opcji.
- Jeśli SignPath **zaakceptuje**: trzeba będzie dokończyć integrację w
  `.github/workflows/build.yml` (SignPath prowadzi przez konfigurację ich
  API do podpisywania w CI).

---

## Sesja 3 (2026-09-21) — ikona, arch-split build, domena espressoplayer.com

### Zrobione

- [x] **Nowa ikona aplikacji** — usunięta stara ikona z czasów "Kaza Player"
  (neonowy kształt przypominający literę K). Najpierw zaprojektowana prosta
  zielona ikonka filiżanki kawy (kolory brandu: `#39ffc0` / `#1fae82`) na
  białym tle, potem podmieniona na dostarczoną przez użytkownika ikonę ziarna
  kawy (brąz na czarnym tle, `website/assets/icons/coffee_icon.png`).
  Zaktualizowane: `assets/icon.icns`, `assets/icon.ico`,
  `website/assets/icons/favicon-32.png` + `icon-180.png`,
  `assets/img/skin/coffee-icon.png`. Header strony (`website/index.html`)
  ma teraz sam tekst "Espresso Player" bez logo — usunięte na życzenie.
- [x] **Build rozbity na architektury (arm64 + x64) zamiast universal** —
  `package.json`: `build.mac.target[0].arch` zmienione z `["universal"]` na
  `["arm64", "x64"]`, `dist:release` bez flagi `--universal`. Efekt: rozmiar
  pobrania spadł z ~205 MB (jeden uniwersalny plik) do ~113 MB (arm64) /
  ~121 MB (x64) — Electron Framework w buildzie universal dublował kod
  natywny dla obu architektur. Strona ma teraz dwa przyciski pobierania
  ("Apple Silicon" / "Intel") zamiast jednego.
- [x] Lokalna zainstalowana appka (`/Applications/Espresso Player.app`) +
  jej dane (`~/Library/Application Support/Espresso Player`, plist w
  Preferences) skasowane na życzenie, żeby przetestować świeże pobranie ze
  strony.
- [x] **Kupiona domena espressoplayer.com** (Porkbun) i przeniesiona pod
  Cloudflare:
  - Nameservery zmienione u Porkbuna z `curitiba/fortaleza/maceio/salvador.ns.porkbun.com`
    na Cloudflare (`ingrid.ns.cloudflare.com`, `nico.ns.cloudflare.com`).
  - MX (`fwd1`/`fwd2.porkbun.com`) i SPF TXT zaimportowane 1:1 do nowej
    zony Cloudflare — mail forwarding powinien przetrwać bez przerwy.
  - Custom domains dodane: `espressoplayer.com` + `www.espressoplayer.com`
    → Cloudflare Pages (projekt `espresso-player`); `dl.espressoplayer.com`
    → R2 bucket `espresso-player-downloads` (docelowo ładny link zamiast
    surowego `pub-....r2.dev`).

### Stan na koniec dnia — NIEDOKOŃCZONE, do sprawdzenia na następnej sesji

- [ ] **Propagacja DNS jeszcze w toku.** Panel Cloudflare pokazywał zonę
  jako aktywną, ale zapytanie do `1.1.1.1` (`dig @1.1.1.1 NS espressoplayer.com`)
  o tej porze nadal zwracało stare nameservery Porkbuna. Sprawdzone też
  bezpośrednio na serwerze `.com` (`dig @a.gtld-servers.net +norec NS
  espressoplayer.com`) — to nie kwestia cache'u resolverów, sam rejestr
  jeszcze ma starą delegację do Porkbuna (TTL 172800 = pełne 48h). Zmiana u
  Porkbuna widocznie jeszcze nie doszła do rejestru; nie ma na to wpływu z
  naszej strony, tylko czekać. **Celowo NIE podmieniono jeszcze linków
  pobierania na stronie** z `pub-47045ea40f3d4f86987f6bf039c31aed.r2.dev`
  na `dl.espressoplayer.com`,
  bo dopóki propagacja nie dojdzie, ten adres serwowałby starą stronę
  parkingową Porkbuna zamiast pliku.
- [ ] Do zrobienia jak propagacja dojdzie:
  1. Zweryfikować `dig @1.1.1.1 NS espressoplayer.com` → powinno zwracać
     `ingrid.ns.cloudflare.com` / `nico.ns.cloudflare.com`.
  2. `curl -I https://dl.espressoplayer.com/EspressoPlayer-1.0.0-arm64.dmg`
     (i wersja x64) → powinno zwracać 200 z R2, nie stronę Porkbuna.
  3. Podmienić oba linki pobierania w `website/index.html` na
     `https://dl.espressoplayer.com/EspressoPlayer-1.0.0-{arm64,x64}.dmg`.
  4. `npx wrangler pages deploy website --project-name=espresso-player` po
     zmianie linków.
  5. Zweryfikować że mail forwarding na `@espressoplayer.com` faktycznie
     działa (wysłać testowego maila) — rekordy są przeniesione 1:1, ale
     warto potwierdzić end-to-end.
  6. Rozważyć posprzątanie starego wildcard rekordu
     `*.espressoplayer.com CNAME uixie.porkbun.com` (parking Porkbuna,
     obecnie nieużywany, nie koliduje z niczym bo `dl`/`www` mają własne
     bardziej szczegółowe rekordy, ale jest już zbędny).

---

## Sesja 4 (2026-09-22) — diagnoza: NS wciąż nie propaguje po 24h

- Zweryfikowane bezpośrednio na serwerach rejestru .com (`dig @a.gtld-servers.net
  +norec NS espressoplayer.com`, też `@b.gtld-servers.net`) oraz whois — po
  ~24h **rejestr nadal zwraca stare nameservery Porkbuna**
  (`curitiba/fortaleza/maceio/salvador.ns.porkbun.com`), nie Cloudflare. To
  zapytanie omija cache resolwerów, więc to nie jest już kwestia propagacji —
  sama zmiana NS najwyraźniej nie doszła do rejestru.
- `espressoplayer-com.l.ink` widoczny w przeglądarce to branded shortlink
  własny Porkbuna używany na ich domyślnej stronie parkingowej — potwierdza,
  że ruch nadal trafia na serwery Porkbuna.
- **Podejrzenie:** zmiana nameserverów w panelu Porkbuna albo się nie
  zapisała, albo domena ma jakąś blokadę (registrar/transfer lock)
  uniemożliwiającą update w rejestrze. To już zbyt długo jak na zwykłą
  propagację NS.
- **Do zrobienia:** zalogować się do panelu Porkbuna → Domain Management →
  sprawdzić czy przy `espressoplayer.com` faktycznie widnieją nameservery
  Cloudflare. Jeśli tak, a rejestr dalej pokazuje Porkbun — zgłosić do
  supportu Porkbuna. Jeśli nie — ustawić ponownie i potwierdzić zapis.

**Update tego samego dnia — naprawione:** przyczyna potwierdzona — w
Porkbunie (`Edit Authoritative Nameservers`) nadal widniały 4 domyślne NS
Porkbuna, zmiana na Cloudflare nigdy się nie zapisała mimo notatki wyżej.
Użytkownik podmienił ręcznie na `ingrid.ns.cloudflare.com` +
`nico.ns.cloudflare.com` i zapisał. Zweryfikowane bezpośrednio na
`a.gtld-servers.net` i przez whois — **zmiana doszła do rejestru natychmiast**
(nie trzeba było czekać 48h). `curl -I https://espressoplayer.com` → `200`
z Cloudflare Pages, strona parkingowa Porkbuna zniknęła.

Pozostało do sprawdzenia: `www.espressoplayer.com` → `522` i
`dl.espressoplayer.com` → `403` tuż po aktywacji strefy — prawdopodobnie
certyfikaty SSL dla tych poddomen jeszcze się wystawiają po stronie
Cloudflare (Pages → Custom domains / R2 → Custom domain, status powinien
przejść z "Pending" na "Active"). Zweryfikować ponownie za jakiś czas, a
potem kontynuować punkty 2–6 z listy TODO wyżej (podmiana linków pobierania
na `dl.espressoplayer.com`, `wrangler pages deploy`, test mail forwardingu).

**Update — w pełni naprawione, ten sam dzień:**
- Pages → Custom domains: oba wpisy (`espressoplayer.com`,
  `www.espressoplayer.com`) utknęły w "Verifying" bo dodane zanim domena
  faktycznie działała na Cloudflare. Kliknięcie "Check DNS records" ręcznie
  wymusiło re-weryfikację → oba przeszły na 200 od razu.
- R2 → bucket `espresso-player-downloads` → Settings → Custom Domains:
  mimo że rekord DNS `dl.espressoplayer.com` (typ R2) istniał, **bucket nigdy
  nie miał tej domeny faktycznie dodanej jako custom domain po swojej
  stronie** ("There is no custom domain assigned to this bucket") — stąd
  403. Naprawione przez ręczne dodanie `dl.espressoplayer.com` w tej sekcji
  → status "Active / Enabled", plik `.dmg` pobiera się poprawnie (zweryfikowano
  `curl` z realnym content-length ~118MB).
- Linki pobierania w `website/index.html` podmienione z
  `pub-47045ea40f3d4f86987f6bf039c31aed.r2.dev` na `dl.espressoplayer.com`.
- Zdeployowane: `npx wrangler pages deploy website --project-name=espresso-player`
  (deployment `91288a8e.espresso-player.pages.dev`) — zweryfikowane że
  `espressoplayer.com` serwuje już nowe linki.
- **Nie zrobione jeszcze:** test end-to-end mail forwardingu na
  `@espressoplayer.com`, oraz posprzątanie zbędnego wildcard rekordu
  `*.espressoplayer.com CNAME uixie.porkbun.com` w Cloudflare DNS (już
  nieaktywny w praktyce, bo specific records wygrywają, ale nieużywany —
  do usunięcia przy okazji).

---

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

- [x] electron-builder config → `.dmg` dla macOS, podpisany Developer ID +
  notaryzowany (sesja 2026-09-21, patrz `CHANGELOG.md`)
- [x] **Ikona aplikacji** — podmieniona (sesja 2026-09-21, patrz sekcja
  "Sesja 3" wyżej). Nowa ikona ziarna kawy w `assets/icon.icns`/`icon.ico`
  + strona, przebudowane i przetestowane.
- [ ] **Build dla Windows** — `npm run dist:win` (target `nsis`) jest w
  `package.json`, ale nigdy nie był realnie zbudowany ani przetestowany w tej
  sesji (robiliśmy tylko macOS). Do zrobienia/sprawdzenia:
  - czy build w ogóle przechodzi na tej maszynie (crossbuild z macOS) czy
    trzeba go robić na Windows/CI,
  - czy wszystkie natywne zależności (ffmpeg, music-metadata) działają na
    Windows tak jak na macOS,
  - podpisywanie kodu dla Windows — bez tego SmartScreen pokaże ostrzeżenie
    "Windows protected your PC" przy pierwszym uruchomieniu, podobnie jak
    niepodpisany macOS. Wymaga certyfikatu code-signing dla Windows (inny
    proces niż Apple Developer ID — EV lub OV cert od zewnętrznego CA, np.
    DigiCert/SSL.com), osobny koszt/proces od tego co już mamy na macOS.
  - strona (`website/index.html`) ma już przygotowany, wyszarzony przycisk
    "Coming soon" dla Windows — po zbudowaniu i podpisaniu podmienić na
    aktywny link do pliku.
- [ ] Auto-updater (electron-updater)

### Wydajność — rzeczy do sprawdzenia

- [ ] **Kolejność ładowania playlist przy starcie** — `App.tsx`, efekt `Load saved library on startup`. Obecnie przy starcie apka buduje metadane (`buildTracks` → `api.readMetadata`) dla **wszystkich** playlist naraz przez `Promise.all`, zanim cokolwiek pokaże w UI — nawet dla playlist, na które użytkownik w danym momencie nie patrzy. Przy bardzo dużych bibliotekach z wieloma playlistami dałoby się to przyspieszyć: najpierw zbudować i pokazać aktywną playlistę, resztę dociągać w tle.
  - Świadomie nieruszane przy poprawce cache'u metadanych (patrz `read-metadata` w `src/main/main.ts`), bo wymaga ostrożnej zmiany logiki zapisu biblioteki (`saveLibrary` efekt w `App.tsx`) — ten efekt buduje `paths` z aktualnej listy `tracks` w stanie, więc gdyby playlista tymczasowo (w trakcie ładowania w tle) miała pustą listę tracków, mogłoby to nadpisać `library.json` pustymi playlistami i skasować realną bibliotekę na dysku.
  - Do zrobienia bezpiecznie: albo trzymać `paths` do zapisu osobno od stanu `tracks` (np. z `sp.paths` dopóki tracks się nie załadują), albo nie odpalać efektu zapisu, dopóki wszystkie playlisty nie skończą wstępnego ładowania.
