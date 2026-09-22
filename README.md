# Espresso Player

A free, offline-first desktop music player for macOS and Windows built with
Electron. No account, no telemetry, no subscription.

**Download:** [espressoplayer.com](https://espressoplayer.com) — signed &
notarized `.dmg` for macOS (Apple Silicon + Intel), `.exe` installer for
Windows. Pre-built binaries are also attached to each
[GitHub Release](https://github.com/KrukowskiAdam/ZENTAPLAYER/releases).

## Features

- Playlist manager with folder watching and auto-import
- Loop editor with pitch-preserving playback speed (0.5×–1.25×) and a
  built-in tuner
- Lossless-to-MP3 conversion (FLAC/WAV → MP3), including from `.cue` sheets
- ID3 tag editor, favorites, and per-album/per-track metadata cache for fast
  startup
- Internet radio with a curated station list
- Native window chrome, no browser cruft

## Development

Requires Node.js 20+.

```bash
npm install
npm run dev      # starts Vite + Electron in dev mode with hot reload
npm run build    # type-checks and builds the renderer + main process
```

## Building distributables

```bash
npm run dist:arm     # macOS, Apple Silicon (.dmg)
npm run dist:x64      # macOS, Intel (.dmg)
npm run dist:win     # Windows x64 (.exe, NSIS installer)
```

`.github/workflows/build.yml` builds macOS and Windows automatically on
GitHub-hosted runners whenever a `v*` tag is pushed, and publishes both to a
GitHub Release.

See [`CODE_SIGNING.md`](CODE_SIGNING.md) for how release binaries are signed.

## License

[MIT](LICENSE)
