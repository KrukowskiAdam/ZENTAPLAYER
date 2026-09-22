# Kaza Player — Mac App Store Roadmap

*Techniczna instrukcja: co zrobiliśmy do tej pory, co trzeba jeszcze zrobić, i jak
(o ile w ogóle) opublikować appkę w Mac App Store.*

Data: 2026-09-14

---

## TL;DR

- **Publikacja w Mac App Store jest technicznie możliwa**, ale wymaga realnego
  projektu inżynieryjnego (sandboxing, przepakowanie ffmpeg, prawdopodobne usunięcie
  ekstrakcji z YouTube), nie kolejnej sesji poprawek. Szacunek: **kilka tygodni**
  pracy, nie dni.
- **Update (ta sesja, 2026-09-14):** podjęto decyzje z Etapu 0 i zaczęto Etap 1 —
  patrz "Log zmian — sesja 2" niżej. Skrót: appka przechodzi na nazwę **Espresso
  Player** (`com.espressoplayer.app`), funkcja YouTube/yt-dlp **usunięta** (nie
  "do usunięcia" — zrobione), zaczęte sandboxing (entitlements, security-scoped
  bookmarks, hook na wbundlowany ffmpeg).
- **iPad / tablety: niemożliwe bez przepisania appki od zera.** Electron (silnik
  tej appki) fizycznie nie działa na iPadOS. To osobny projekt w innej technologii
  (Swift/SwiftUI, albo cross-platform: Flutter/React Native/Capacitor), nie
  rozszerzenie obecnego kodu.
- **Dystrybucja poza App Store (obecny sposób — DMG z tej sesji) działa już teraz**
  i nie wymaga żadnej z poniższych zmian. To w pełni legalna, częsta metoda
  dystrybucji dla macOS (np. VLC, OBS, wiele indie-appek).

---

## Plan na następną sesję

W tej kolejności — każdy punkt zależy od tego wyżej:

1. **Universal ffmpeg (arm64+x64)** — jedyna rzecz techniczna, którą da się
   zrobić *bez* konta Apple Developer. Dzisiejszy `resources/mas/ffmpeg` jest
   arm64-only (zbudowany na tym Macu). Trzeba: (a) puszczić
   `scripts/build-ffmpeg-lgpl` jeszcze raz na maszynie/runnerze x64 — albo
   przez GitHub Actions, tak jak robi to oryginalny `mifi/ffmpeg-build-script`
   dla LosslessCut — (b) złączyć oba binarki `lipo -create ffmpeg-arm64
   ffmpeg-x64 -output ffmpeg`.
2. **Ikona appki** — user odłożył na później ("dodamy później"). Coffee-shop
   styl, do zrobienia jako `.icns` (macOS) — obecny `assets/icon.icns` to
   jeszcze stary, trzeba podmienić przed realnym uploadem.
3. **Konto Apple Developer Program** (99$/rok) — to musi zrobić użytkownik
   osobiście (dane firmy/osoby, płatność), ja nie mogę tego za niego założyć.
   Odblokowuje Etap 2 (certyfikaty, provisioning profile) i Etap 3 (App Store
   Connect).
4. **Test `webSecurity: false`** na żywej appce (odsłuchanie kilku realnych
   internet-radio streamów z wizualizatorem włączonym) — sprawdzić, czy dałoby
   się to bezpiecznie wyłączyć bez utraty funkcji.
5. **Etap 3 — App Store Connect** (metadata, privacy questionnaire, opis,
   zrzuty ekranu) — dopiero po punkcie 3.

---

## Log zmian — sesja 2 (2026-09-14)

Kontynuacja tej samej sesji, konkretnie pod plan App Store — Etap 0 i część
Etapu 1:

1. **Usunięto funkcję YouTube/yt-dlp** — `extract-audio-url`/`findYtDlp` z
   `main.ts`, `extractAudioUrl` z `preload.ts`, rozpoznawanie serwisów wideo w
   `Sidebar.tsx`. Generyczny "Add Stream URL" (radio/mp3) został.
2. **Rebranding: Kaza Player → Espresso Player**, `com.zentaplayer.app` →
   `com.espressoplayer.app`. Zmienione w `package.json`, `main.ts`,
   `index.html`, `Sidebar.tsx`. `package-lock.json` przeregenerowany
   (`npm install --package-lock-only`).
3. **Sandboxing — start:**
   - `build/entitlements.mas.plist` + `build/entitlements.mas.inherit.plist`
   - Target `mas` w `package.json` (`build.mas`) + skrypt `dist:mas`
   - `findFfmpeg()` sprawdza wbundlowany `process.resourcesPath/ffmpeg` przed
     szukaniem systemowego ffmpeg
   - Security-scoped bookmarks: `open-files`/`open-folder`/`pick-watch-folder`
     zapisują bookmark przy wyborze, `restoreSecurityScopedAccess()` odświeża
     je przy starcie appki
   - Usunięty martwy protokół `localfile://` z `main.ts`
   - Zweryfikowano: `tsc --noEmit` czysto, `npm run build` czysto, obecny
     `electron-builder --mac dmg` build nadal działa bez zmian

**Nierozstrzygnięte, wymaga decyzji/działania poza kodem:** licencja binarku
ffmpeg do bundlowania (GPL vs LGPL-only build), realne podpisywanie
(certyfikat Mac App Distribution), test `webSecurity: false` na żywej appce.

## Log zmian — sesja 3 (2026-09-14, kontynuacja)

Rozstrzygnięto kwestię licencji ffmpeg z sesji 2:

- Znaleziono realny precedens: `mifi/ffmpeg-build-script`, skrypt używany
  przez **LosslessCut** (Electron app na Mac App Store) do budowy własnego
  ffmpeg. Sprawdzone: ten skrypt domyślnie włącza `--enable-gpl`,
  `--enable-nonfree` i `libx264` — czyli LosslessCut na MAS realnie bundluje
  GPL-ffmpeg i przechodzi review. Apple nie skanuje licencji binarek.
- Mimo to, wybrano czystszą opcję: sforkowano ten skrypt i usunięto wszystkie
  kodeki wideo (x264, libvpx, libwebp, dav1d, svtav1 — appka nie potrzebuje
  żadnego z nich) + `openssl` (appka nie odpytuje ffmpeg o URL-e) +
  `--enable-gpl`/`--enable-nonfree`, i dodano `libmp3lame` (LGPL-2.0 — jedyny
  kodek, którego appka faktycznie potrzebuje, do enkodowania MP3).
- Zbudowano binarz **lokalnie na tym Macu** (arm64): `ffmpeg -version` →
  `License: LGPL version 3 or later`. Przetestowano realną konwersję
  WAV→MP3+tagi — działa identycznie jak systemowy ffmpeg używany dotychczas.
  Spakowano próbny build MAS (`electron-builder --mac mas --dir`) — binarz
  ląduje w `Contents/Resources/ffmpeg` i działa stamtąd.
- Skrypt budujący zapisany w repo: `scripts/build-ffmpeg-lgpl` (do rebuildu
  przy nowej wersji ffmpeg). Sam binarz: `resources/mas/ffmpeg` (gitignored).

**Zostało:** build jest arm64-only — "universal" MAS wymaga jeszcze przejścia
tego samego skryptu na maszynie/runnerze x64 i złączenia `lipo -create`
(dokładnie jak robi to oryginalny projekt w CI).

---

## Co zrobiliśmy do tej pory (log sesji)

### Funkcje

1. **Wyszukiwarka utworów** w headerze playlisty — filtrowanie na żywo po
   artyście/albumie/tytule/nazwie pliku.
2. **Live Folder** — appka obserwuje wskazany folder (`fs.watch`, recursive) i
   automatycznie synchronizuje playlistę z zawartością dysku (dodaje nowe pliki,
   usuwa zniknięte). Wskaźnik: statyczna kropka przy nazwie zakładki (bez animacji
   — świadoma decyzja, żeby nie wyglądało jakby "coś się działo" cały czas).
3. **Konwersja FLAC/WAV → MP3** przy imporcie (`+Folder`, `+File`, Live Folder) —
   prompt z wyborem: zachowaj oryginał / konwertuj / usuń oryginał po konwersji.
   Zachowuje tagi i okładkę (ffmpeg, VBR najwyższej jakości).
4. **Podział albumu-w-jednym-pliku wg cuesheeta** — jeśli FLAC ma towarzyszący
   `.cue`, konwersja dzieli go na osobne, poprawnie otagowane utwory (własny
   parser cuesheetów, bez zewnętrznej zależności).
5. **Auto-dociąganie okładek albumów** — gdy brakuje i osadzonej okładki, i pliku
   w folderze, appka pyta iTunes Search API (bez klucza) i zapisuje wynik jako
   `cover.jpg` w folderze albumu. Ma filtr na "śmieciowe" zapytania (np. tag
   albumu "CD 1" zamiast prawdziwego tytułu) i walidację czy zwrócony wykonawca
   w ogóle pasuje — obie rzeczy naprawiały realny, potwierdzony bug (zła okładka).
6. **Naprawa losowości radia** — `order=random` w Radio Browser API nie było
   faktycznie losowe (to samo zapytanie = te same stacje za każdym razem).
   Przełączono na oficjalny load-balancowany host (`all.api.radio-browser.info`,
   HTTPS) + losowanie po stronie appki.

### Wydajność i diagnostyka

7. **Naprawiono zawieszanie się appki** przy konwersji dużych folderów FLAC —
   przyczyna: przeszukiwanie folderu w poszukiwaniu `.cue` przy **każdym** pliku
   osobno, skalujące się kwadratowo (zmierzone: 1600 plików w jednym folderze =
   ~2s zamiast ~3ms). Naprawa: cache listy plików per-folder.
8. **System logów** — appka zapisuje strukturalny log do pliku
   (`~/Library/Application Support/Kaza Player/logs/app.log`), dostępny przez
   menu **Help → Open Log File / Show Log Folder**.
9. **Przycisk Cancel** przy długiej konwersji.

### UI / wygląd

10. **Pełny reskin "Coffee Shop"** wg dostarczonego projektu z Figmy:
    - Paleta kolorów oparta o `#C67C4E` (karmel/akcent), ciemne tło (`#292929`/`#313131`)
    - Font **Sora** (Google Fonts) wszędzie — usunięty stary custom font
    - Zestaw ikon **react-iconly** (Iconly, ten sam co w referencji) zastępujący
      emoji w całej appce; 3 własne ikony (pauza/stop/płyta) dorysowane w tym samym stylu
    - Wszystkie kolory scentralizowane w zmiennych CSS (`global.css`) — dzięki temu
      zmiana motywu (dark→light→dark ponownie w tej sesji) to edycja jednego pliku
11. **Grafika okładki albumu** powiększona o ~120% (84px → 214px)
12. **Menu macOS** przebudowane pod kątem "gotowej" appki (patrz niżej — to też
    pierwszy krok pod App Store)

### Sprzątanie danych użytkownika (poza appką)

13. Wykryto i usunięto duplikaty w bibliotece muzycznej (`/Users/adam/Music/Music`)
    — 224 bajt-identyczne pliki + 2 duplikaty folderów (po porównaniu jakości),
    odzyskano ~2.1GB.

---

## Menu macOS — zmiany zrobione teraz (i dlaczego)

| Zmiana | Powód |
|---|---|
| Dodano menu **File** (Add Files ⌘O, Add Folder ⌘⇧O, Add Live Folder, New Playlist ⌘N) | Appka w ogóle nie miała menu File — nietypowe dla appki macOS |
| Dodano menu **Playback** (Play/Pause, Toggle Loop) | Odtwarzacz muzyki bez menu sterowania odtwarzaniem to rzadkość |
| **"Reload" / "Toggle DevTools"** ukryte w buildzie produkcyjnym | Narzędzia deweloperskie widoczne w gotowej appce wyglądają niedokończenie, prawdopodobnie zauważy to App Review |
| **"Debug"** → **"Help"** | Nazwa "Debug" sugeruje zapomniane wewnętrzne narzędzie; "Help" to standardowa, oczekiwana lokalizacja takich funkcji |
| Dodano `Zoom` / `Bring All to Front` w menu Window | Brakujące standardowe role macOS |
| Spersonalizowane okno "About" | Wersja + opis zamiast pustego domyślnego panelu |

---

## Krok po kroku: publikacja w Mac App Store

### Etap 0 — Decyzje wstępne

- [x] **Bundle ID** — zmienione z `com.zentaplayer.app` na `com.espressoplayer.app`,
      appka przemianowana z "Kaza Player" na **"Espresso Player"** (poprawny zapis —
      "espreso"/"ekspreso"/"expreso" to błędne zapisy) w `package.json`, `main.ts`,
      `index.html`, `Sidebar.tsx`. Zrobione **przed** rejestracją w Apple, jak
      wymagane.
- [ ] **Konto Apple Developer Program** — 99$/rok, wymaga D-U-N-S number jeśli
      rejestrujesz jako firma (osobiste konto jest prostsze/szybsze).
- [x] **Decyzja o funkcji "Add URL" / ekstrakcji z YouTube (yt-dlp)** — decyzja:
      **usunąć**. Zrobione: cały handler `extract-audio-url`/`findYtDlp` usunięty z
      `main.ts`, `extractAudioUrl` usunięty z `preload.ts`, UI w `Sidebar.tsx`
      uproszczone do generycznego "Add Stream URL" (bez rozpoznawania
      YouTube/Vimeo/Twitch/SoundCloud). Zwykłe stream URL (radio, mp3-stream) —
      zostało, to nie był problem.

### Etap 1 — App Sandbox (największa zmiana techniczna)

Mac App Store **wymaga** App Sandbox. To zmienia zasady dostępu appki do systemu:

- [x] **Bundlowanie ffmpeg wewnątrz appki — zrobione, w tym sam binarz.**
      `findFfmpeg()` w `main.ts` sprawdza najpierw `process.resourcesPath/ffmpeg`
      (wbundlowany binarz), dopiero potem spada do szukania systemowego ffmpeg
      (tylko dla obecnego DMG-builda). Target `mas` w `package.json`
      (`build.mas.extraResources`) wskazuje na `resources/mas/ffmpeg`.
      **Licencja rozwiązana:** znalazłem, że popularny pakiet npm `ffmpeg-static`
      to GPL-3.0 (przez `libx264`), co koliduje z regulaminem MAS. Zamiast tego
      **zbudowałem własny, minimalny binarz LGPL-only** lokalnie na tym Macu —
      fork skryptu `mifi/ffmpeg-build-script` (używanego realnie przez LosslessCut
      na MAS) z usuniętymi x264/libvpx/libwebp/dav1d/svtav1/openssl i
      `--enable-gpl`/`--enable-nonfree`, plus dodanym `libmp3lame` (LGPL-2.0,
      potrzebny do enkodowania MP3 — appka i tak nic więcej z ffmpeg nie
      potrzebuje: FLAC/WAV-dekodowanie jest wbudowane, kopiowanie
      strumieni/tagów też). **Zweryfikowane:**
      `ffmpeg -version` → `License: LGPL version 3 or later`; realny test
      konwersji WAV→MP3 z tagami działa; spakowany build MAS (`electron-builder
      --mac mas --dir`) ma binarz pod `Contents/Resources/ffmpeg` i stamtąd też
      działa. Skrypt budujący: `scripts/build-ffmpeg-lgpl` (do rebuildu przy
      nowszej wersji ffmpeg). Sam binarz w `resources/mas/ffmpeg` (gitignored —
      to bytes, nie kod; rebuilduje się ze skryptu).
      **Zostało:** to jest build **arm64-only** (ten Mac). Do finalnego
      "universal" MAS-builda trzeba jeszcze x64 (np. runner Intel/GitHub Actions)
      i złączyć `lipo -create` — dokładnie tak jak robi to `mifi/ffmpeg-build-script`
      w CI dla LosslessCut.
- [x] **yt-dlp** — usunięty całkowicie (patrz Etap 0). Nieaktualne jako punkt
      Etapu 1 — nie trzeba już bundlować.
- [x] **Live Folder + zapis okładek + zapis tagów — security-scoped bookmarks** —
      zaimplementowane w `main.ts`: `open-files`/`open-folder`/`pick-watch-folder`
      proszą teraz o `securityScopedBookmarks` przy wyborze i zapisują je do
      `security-bookmarks.json` (w `userData`); `restoreSecurityScopedAccess()`
      odświeża wszystkie zapisane bookmarki przy starcie appki (wymagane, żeby
      dostęp przetrwał restart appki w sandboxie). Poza sandboxem (dzisiejszy
      build) to no-op — zero wpływu na obecną wersję.
- [x] **Entitlements** — dodane pliki `build/entitlements.mas.plist`
      (`com.apple.security.app-sandbox`, `network.client`,
      `files.user-selected.read-write`, `files.bookmarks.app-scope`) i
      `build/entitlements.mas.inherit.plist` (standardowy szablon dla procesów
      potomnych), podpięte w `package.json` → `build.mas`.
- [ ] Rozważyć `webSecurity: false` w `main.ts` — sprawdzone: to jest potrzebne
      dla wizualizacji audio (AudioMotionAnalyzer) na streamach radiowych bez
      nagłówków CORS. Wyłączenie nie zepsuje odtwarzania, ale może uciszyć
      wizualizator dla części streamów. **Wymaga testu na żywo appki** — nie
      zmienione w tej sesji, bo nie da się tego bezpiecznie zweryfikować bez
      odsłuchania realnych streamów.
- [x] Usunąć martwy kod: zarejestrowany, ale nieużywany protokół `localfile://`
      w `main.ts` — usunięty (audio i tak idzie przez IPC + Blob URL, ten
      protokół nigdy nie był używany przez renderer).
- [ ] **`npm run dist:mas` realnie nie zadziała jeszcze** — `mac.identity: null`
      (potrzebne dziś, żeby DMG builda się bez certyfikatu) dziedziczy się też do
      `mas`. Do prawdziwego builda MAS trzeba będzie ustawić właściwy certyfikat
      "Mac App Distribution" (patrz Etap 2) i dorzucić binarz ffmpeg (patrz wyżej).
      **Zweryfikowane w tej sesji:** dodanie sekcji `mas` nie zepsuło obecnego,
      działającego builda DMG (`electron-builder --mac dmg` przeszedł bez zmian).

### Etap 2 — Podpisywanie i certyfikaty

*(Entitlements + target `mas` w electron-builder są już zrobione — patrz Etap 1.
Zostały tylko rzeczy, które wymagają konta Apple Developer.)*

- [ ] **Konto Apple Developer Program** (99$/rok) — blokuje wszystko poniżej
- [ ] **Mac App Distribution** certyfikat (do podpisania samej appki)
- [ ] **Mac Installer Distribution** certyfikat (do podpisania paczki `.pkg`)
- [ ] **Provisioning profile** dla Mac App Store, powiązany z Bundle ID appki
- [ ] Podać właściwy certyfikat w `build.mas` (obecnie dziedziczy `mac.identity:
      null`, które trzeba nadpisać, gdy certyfikat już będzie zainstalowany)

### Etap 3 — App Store Connect

- [ ] Rejestracja Bundle ID w Apple Developer Portal
- [ ] Utworzenie appki w App Store Connect: nazwa, kategoria (Music), wiekowa
      ocena treści
- [ ] **App Privacy questionnaire** — wymagane nawet jeśli appka nie zbiera
      żadnych danych (trzeba to jawnie zadeklarować)
- [ ] Polityka prywatności (URL) — wymagana nawet dla appki bez zbierania danych
- [ ] Zrzuty ekranu w wymaganych rozdzielczościach dla Mac
- [ ] Ikona 1024×1024 (macOS icon set już istnieje jako `.icns` — trzeba
      sprawdzić czy ma odpowiednie rozmiary)
- [ ] Opis appki, słowa kluczowe, URL wsparcia

### Etap 4 — Upload i review

- [ ] Build przez `electron-builder --mac mas` → `.pkg`
- [ ] Upload przez Transporter (appka Apple) albo `xcrun altool`/`notarytool`
- [ ] Wewnętrzne testy przez TestFlight dla Mac (opcjonalnie, ale zalecane —
      sandboxing potrafi cicho psuć funkcje bez crashowania appki, trzeba
      dokładnie przetestować Live Folder, zapis tagów, konwersję)
- [ ] Submit do App Review

---

## ⚠️ Realne ryzyka dla App Review

1. ~~**yt-dlp / ekstrakcja audio z YouTube**~~ — **rozwiązane (usunięte w tej
   sesji).** Apple regularnie odrzuca appki, które pozwalają pobierać treści z
   serwisów streamingowych z naruszeniem ich regulaminu (guideline 5.2.3) —
   funkcja została całkowicie wycięta z kodu, nie tylko odłożona.
2. **Internet radio** — samo w sobie zwykle OK (jest sporo appek-katalogów
   radiowych w App Store), ale warto się upewnić że Radio Browser API ma
   jasne zasady użycia.
3. **Konwersja FLAC/MP3 przez ffmpeg** — nie powinno być problemem (to
   narzędzie audio, nie obchodzenie DRM).
4. ~~**Licencja bundlowanego ffmpeg**~~ — **rozwiązane.** Zbudowany własny,
   minimalny binarz LGPL-only (bez x264/GPL/nonfree) — patrz Etap 1. Warto
   wiedzieć: realny precedens (**LosslessCut**, Electron app na MAS) bundluje
   ffmpeg z GPL+x264 i przechodzi Apple Review — Apple nie skanuje licencji
   binarek — ale zdecydowaliśmy się na czystszą opcję, bo to nie zmienia
   samego faktu prawnego.

---

## Inne poprawki niezwiązane bezpośrednio z App Store

- [ ] Rozmiar paczki JS: 338KB → 860KB (194KB gzip) po dodaniu `react-iconly`.
      Nieistotne dla appki desktopowej (brak opóźnień sieciowych), ale do
      ewentualnej optymalizacji jeśli kiedyś będzie to miało znaczenie.
- [ ] Brak ekranu "Preferences" — obecnie appka nie ma ustawień (np.
      domyślny folder muzyki, jakość konwersji). Nie blokuje niczego, ale
      typowa appka macOS to ma (`⌘,`).
- [ ] Brak auto-updatera dla dystrybucji **poza** App Store (DMG) —
      `electron-updater` + własny serwer/GitHub Releases, jeśli planujesz
      rozwijać appkę po publikacji poza MAS.
- [ ] Wersjonowanie — `package.json` cały czas na `1.0.0`, warto zacząć
      realnie bumpować przy każdym wydaniu.

---

## Podsumowanie priorytetów

Jeśli celem jest **Mac App Store**: zacznij od Etapu 0 (decyzja o Bundle ID i
YouTube) — to determinuje resztę planu. Etap 1 (sandboxing) to główny nakład
pracy inżynieryjnej.

Jeśli na razie wystarczy **dystrybucja poza App Store** (tak jak teraz — DMG),
appka jest już w pełni gotowa do użytku i dalszego rozwoju bez żadnej z
powyższych zmian.
