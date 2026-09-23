# Changelog

Wszystkie istotne zmiany w Espresso Player są dokumentowane w tym pliku.

## [Unreleased] — planowane 1.0.1

Czeka na zatwierdzenie 1.0.0 w Microsoft Store — potem jedna aktualizacja
na wszystkie platformy.

### Poprawki

- **ffmpeg nie był wykrywany na Windows** (`0f7e870`). Każde wywołanie
  ffmpeg doklejało do `PATH` katalogi Homebrew rozdzielone `:`; na Windows
  prawdziwa zmienna to `Path` (separator `;`), a Node wybierał zepsuty
  duplikat — zainstalowany ffmpeg był niewidoczny, konwersja i zapis tagów
  FLAC/WAV nie działały. Teraz `ffmpegEnv()` modyfikuje PATH tylko poza
  Windows. Komunikat o braku ffmpeg na Windows podpowiada
  `winget install ffmpeg` + restart aplikacji (zamiast `brew install`).
- **Martwe wpisy 0 s po konwersji z usuwaniem oryginału** (`64a71b4`).
  Ponowne dodanie folderu z FLAC-ami już obecnymi na playliście proponowało
  ich konwersję; z opcją "Delete original" MP3 były dodawane, a stare wpisy
  zostawały, wskazując na usunięte pliki. Teraz dodawanie pomija ścieżki
  już obecne na playliście, a po konwersji z usuwaniem każda playlista,
  która nadal miała usunięty oryginał, dostaje w jego miejsce MP3.

### Nowe

- **File → Remove Missing Files…** (`4c25108`) — usuwa z playlist wpisy,
  których pliki zniknęły z dysku. Przed usunięciem natywne okno z liczbą
  brakujących plików per playlista (ochrona przed odłączonym dyskiem
  zewnętrznym). Pliki na dysku nigdy nie są kasowane.

### Dystrybucja

- **Microsoft Store (MSIX)** — target `appx` w electron-builder, CI buduje
  `.appx` jako artefakt, tożsamość pakietu z Partner Center. Wersja 1.0.0
  wysłana do certyfikacji 2026-09-23 (szczegóły w `STATUS.md`, Sesja 6).
- Strona: polityka prywatności `espressoplayer.com/privacy`, usunięte
  wzmianki o SignPath.

## [1.0.0] — 2026-09-21

Pierwsze wydanie produkcyjne. Poniżej pełny log poprawek z sesji hardeningowej
poprzedzającej release (bugi znalezione przez `/code-review high` + zgłoszenia
wizualne/UX).

### Dystrybucja

- **Podpis Developer ID + notaryzacja Apple.** Build macOS jest teraz podpisany
  prawdziwym certyfikatem "Developer ID Application" (wcześniej `identity: null`
  — zupełnie bez podpisu) i przechodzi pełną notaryzację przez `notarytool`.
  Zweryfikowane end-to-end z symulowaną flagą kwarantanny (jak po pobraniu z
  przeglądarki) — `spctl` zwraca `accepted, source=Notarized Developer ID`.
  Aplikacja pobrana ze strony otwiera się teraz bez żadnych ostrzeżeń
  Gatekeepera, bez potrzeby klikania prawym przyciskiem.
  - `package.json`: `mac.hardenedRuntime: true`, `mac.entitlements` →
    `build/entitlements.mac.plist` (nowy plik, hardened-runtime, osobny od
    sandboxowych entitlements używanych tylko przez `dist:mas`).
  - Nowy skrypt `npm run dist:release` — buduje, podpisuje i notaryzuje przez
    zapisany w Keychain profil `espresso-notary` (dane logowania nigdy nie
    trafiają do repo ani do historii poleceń).
- **Strona produktu** (`website/index.html`) — prosta strona ze zrzutami
  ekranu pięciu głównych funkcji (playlist, loop editor/tuner, favorites,
  konwersja FLAC/WAV→MP3, radio internetowe) i sekcją pobierania.
- **Hosting na Cloudflare, bez zależności od GitHuba.** Strona wdrożona na
  Cloudflare Pages (`espresso-player.pages.dev`), plik `.dmg` hostowany na
  Cloudflare R2 (`pub-....r2.dev`) — R2 nie nalicza opłat za transfer nawet
  przy dużym ruchu, w przeciwieństwie do większości alternatyw. Jak dokupimy
  domenę, podpinamy ją do obu (Pages → custom domain, R2 → subdomena typu
  `dl.espressoplayer.app`).

### Naprawione błędy

- **Konwersja albumu z pliku .cue** — częściowa porażka (część utworów się nie
  skonwertowała) była zgłaszana jako pełny sukces; teraz zwraca błąd z liczbą
  nieudanych utworów, a użytkownik widzi to jako alert.
- **"Convert to MP3" na zaznaczonych utworach** — utwory, których konwersja się
  nie powiodła, były mimo to usuwane z playlisty (znikały bezpowrotnie); teraz
  zostają nietknięte w playliście.
- **"Update Folders" na wielu playlistach naraz** — wyścig (race condition)
  sprawiał, że tylko ostatnia playlista dostawała prompt o konwersji nowych
  plików lossless, reszta była po cichu pomijana. Dodano kolejkę promptów.
- **Przesuwanie grup (albumów) górę/dół** — przy aktywnym wyszukiwaniu lub
  filtrze "tylko ulubione" indeksy grup na filtrowanej liście nie zgadzały się
  z indeksami w pełnej playliście, co mogło zamienić kolejność zupełnie innych
  albumów. Funkcja jest teraz zablokowana, gdy filtr jest aktywny.
- **"Set as Album"** — przy zaznaczeniu utworów z dwóch różnych folderów
  wszystkie dostawały nazwę albumu tylko z folderu pierwszego zaznaczonego
  utworu. Teraz każdy utwór dostaje nazwę swojego własnego folderu.
- **Nazwy playlist** — ręcznie nadana nazwa pasująca wzorcem do nazwy
  automatycznej (np. "Playlist 5") mogła zostać po cichu przenumerowana po
  usunięciu innej playlisty. Provenance nazwy jest teraz śledzone osobną flagą
  zamiast dopasowania tekstu.
- **Główny przycisk play/pause** — nie miał żadnej ikony (zgubione przy
  migracji biblioteki ikon), tylko tooltip. Przywrócona ikona ▶ / ⏸ — jako
  zwykły, pełny trójkąt (własny SVG w `icons.tsx`), bo gotowa ikona z
  biblioteki `react-iconly` rysowała trójkąt zamknięty w kółku.
- **Licznik czasu w transporcie "przesuwał" pasek postępu** — cyfry w foncie
  proporcjonalnym mają różną szerokość, więc licznik zmieniał szerokość co
  sekundę i spychał pasek obok siebie. Naprawione przez
  `fontVariantNumeric: 'tabular-nums'`.
- **Zaznaczanie utworu z cmd/ctrl/shift** — nie ustawiało "aktywnego" utworu,
  więc spacja (play/pause) mogła nic nie robić mimo że wiersz wyglądał na
  zaznaczony.
- **Nazwy plików na Windows** — wyciąganie nazwy pliku ze ścieżki działało
  tylko dla `/`, więc na Windows (ścieżki z `\`) jako nazwa utworu wyświetlała
  się cała ścieżka zamiast samej nazwy pliku.

### Wydajność

- **Cache metadanych i okładek** — aplikacja parsowała od nowa tagi ID3 i
  okładkę każdego utworu przy **każdym** uruchomieniu, nawet gdy nic się nie
  zmieniło. Dodano trwały cache (`metadata-cache.json`) kluczowany ścieżką +
  mtime/rozmiarem pliku; niezmienione pliki są odczytywane błyskawicznie z
  cache zamiast być parsowane od nowa. Okładki dodatkowo deduplikowane po
  hashu treści (jedna okładka na album, nie na utwór).

### UI / UX

- Drewniana obwódka wokół całej aplikacji pogrubiona o 50%.
- Pasek postępu odtwarzania w transporcie: kolor zmieniony z pomarańczowego
  (pozostałość starego motywu) na zielony, zgodny z resztą interfejsu.
- Usunięty suwak prędkości odtwarzania — zostały tylko przyciski presetów
  (0.5× / 0.75× / 1× / 1.25×).
- Naprawiony natywny pomarańczowy pierścień fokusu na przyciskach (zależny od
  koloru systemowego macOS) — zastąpiony spójnym zielonym stylem fokusu.
- Nagłówek kolumn (ARTIST / ALBUM / TITLE / #) jest teraz widoczny zawsze,
  także dla pustej playlisty, zamiast pojawiać się dopiero po dodaniu
  pierwszego pliku.
- Naprawiona szara szczelina tła prześwitująca pod nagłówkiem kolumn w pustym
  stanie playlisty.
- Ikona serca (ulubione) przy nieaktywnym stanie jest teraz przezroczysta/mniej
  widoczna, żeby nie rzucała się w oczy przy każdym utworze.
- Usunięty niepotrzebny licznik czasu odtwarzania w zakładce Radio (stacje
  live nie mają sensownej długości/pozycji).
- Zastosowany retro font (Michroma, ten sam co w logo "Espresso Player") w
  nagłówku panelu Radio.
- Dodany przycisk mute obok suwaka głośności (zielona ikona głośnika = dźwięk
  włączony, szara = wyciszony; zapamiętuje poprzedni poziom głośności).

### Sprzątanie

- Usunięte niepotrzebne pliki graficzne/źródłowe z `assets/img/skin`
  (pakiety tekstur PBR, pliki `.blend`, zdjęcie stockowe — łącznie ok. 163MB
  nieużywanych materiałów roboczych, niereferencowanych nigdzie w kodzie).

### Świadomie pozostawione bez zmian

- Funkcja "Add Stream URL" (ręczne dodawanie własnego streamu radiowego)
  pozostaje usunięta — to była celowa decyzja, nie regresja.
- 20+ drobniejszych znalezisk code-review (duplikacja kodu ffmpeg PATH,
  niezmemoizowane filtrowanie/grupowanie w Sidebar, sekwencyjne zamiast
  równoległe konwersje ffmpeg, kosztowny `detectPitch` liczony na każdym
  ticku waveformu) — niżej priorytetowe, do zrobienia w kolejnej iteracji.
