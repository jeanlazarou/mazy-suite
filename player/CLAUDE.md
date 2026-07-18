# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm start          # Dev server (CRA, port 3000)
pnpm build          # Production build
pnpm test           # Jest test runner (interactive watch mode)
pnpm run format     # Prettier formatting
```

This is a Create React App project. No custom webpack config.

## Architecture

React 18 music player application using a hybrid state architecture:

- **Recoil** for UI state (atoms in `src/atoms.js`, selectors for derived/async state)
- **RxJS Subjects** for imperative cross-component communication (commands, track events, options)
- **Document CustomEvents** for Sequencer-to-UI synchronization

### Data Flow

```
User interaction → RxJS stream (commands$, tracks$, options$)
  → useLayoutEffect subscription → Recoil setState → re-render

Sequencer state change → document.dispatchEvent(CustomEvent)
  → component addEventListener → Recoil setState → re-render
```

### Key Modules

- **Sequencer.js** — Singleton audio playback engine. The WaveSurfer instance IS the audio backend (set via `Sequencer.setAudioInstance(surfer)`). Manages playlist navigation (next/prev/loop), subscribes to `commands$` and `options$` streams, fires `sequencer:*` document events for UI sync. Static methods delegate to the singleton instance. Uses in-memory playback: decodes audio to AudioBuffer via BuffersLoader, converts to WAV Blob URL, then loads with `surfer.load(blobUrl)`. This eliminates seek buffering delays (instant seeking like v5's `loadDecodedBuffer`).

- **Waveform.js** — WaveSurfer.js v7 integration. Creates the WaveSurfer instance (which internally creates its own `<audio>` element) and passes it to the Sequencer. Listens for `sequencer:playing` and `sequencer:position` events to update the `playingTrack` Recoil atom.

- **CommandsStream.js** — RxJS Subject broadcasting player commands: `PLAY`, `PAUSE`, `STOP`, `NEXT`, `PREVIOUS`, `JUMP`, `SHUFFLE`, `SAVE`, etc.

- **TracksStream.js** — RxJS Subject (throttled 500ms) for track interactions: `select`, `toggle`, `rate`.

- **OptionsStream.js** — RxJS ReplaySubject for user preferences: loop mode, card format, lyrics.

- **Player.js** — Main container. Subscribes to command/track/option streams, dispatches Recoil state updates, handles undo/redo.

- **AudioSequencer.js** — Non-rendering component that loads playlist metadata asynchronously and restores persisted track states.

- **BuffersLoader.js** — Validates audio files by reading byte signatures (MP3/OGG magic bytes) via HTTP Range requests. Decodes audio via `AudioContext.decodeAudioData()` to extract metadata (duration) and provide AudioBuffer for in-memory playback. The decoded buffer is converted to a WAV Blob URL by Sequencer for instant seeking without buffering delays.

- **LyricsSubtitle.js** — Synchronized lyrics display. `LyricVerse` listens directly for `sequencer:position` document events (NOT via Recoil) and uses `sortedIndexBy` binary search on SRT-parsed timings to find the current verse. Lyrics are loaded from `./data/lyrics/{title}.srt` via a Recoil `selectorFamily`.

### Persistence

- **localStorage**: user preferences (`player-options`), feature flags (`player-features`), per-track state (`playlist.track.{url}`), track order (`playlist.order.{title}`)
- **IndexedDB**: audio file metadata cache (`playlist-db/Metadata`)

### Sequencer Events (document CustomEvents)

`sequencer:ready`, `sequencer:loaded`, `sequencer:load-error`, `sequencer:start`, `sequencer:playing`, `sequencer:paused`, `sequencer:continue`, `sequencer:stopped`, `sequencer:ended`, `sequencer:position`

### Playlist Loading

Query param `?list=name` loads `./data/{name}.json`. A sibling `.md` file is loaded for the description panel. Description markdown supports special tokens: `$T:song-title` (song marker), `$A` (authors), `$C` (creation date), `$AC` (authors + date), and inline `<style>` blocks.

## Key Libraries

- **wavesurfer.js 7.12.1** — Waveform visualization and audio playback. Creates its own internal `<audio>` element. `surfer.load(url)` fetches, decodes, and renders the waveform (async, returns Promise). `surfer.play()` starts playback.
- **@dnd-kit** — Drag and drop for playlist reordering
- **Semantic UI React** — UI component library
- **styled-components** — CSS-in-JS styling
- **Fuse.js** — Fuzzy search for track filtering
- **Luxon** — Date/time formatting

## WaveSurfer v7 API Notes

Important behavioral details for the WaveSurfer v7 integration:

### Event mapping (v5 → v7)

| Old (v5)         | New (v7)        | Callback args                  | Notes |
|------------------|-----------------|--------------------------------|-------|
| `audioprocess`   | `timeupdate`    | `(currentTime: number)`        | Timer-driven at ~60fps during playback. Also emitted by `setTime()` on seek. Suppressed while `media.seeking === true`. |
| `seek`           | `interaction`   | `(newTime: number)`            | Fires on user click/drag on waveform. Provides time in seconds directly (v5 gave 0-1 progress). |
| `finish`         | `finish`        | `()`                           | Unchanged. |
| `loadDecodedBuffer` | `load(url)`  | Returns `Promise<void>`        | v7 has no `loadDecodedBuffer`. Use `load(url)` which fetches, decodes, and renders. |

### Seeking internals

- **User clicks waveform** → renderer `click` event → `seekTo(relativeX)` → `setTime(time)` → emits `timeupdate` + `interaction` synchronously, then native `seeking` event fires async.
- **Programmatic seek** (`skip(seconds)`) → `setTime(currentTime + seconds)` → emits `timeupdate` synchronously.
- The 60fps timer **suppresses** `timeupdate`/`audioprocess` while `media.seeking === true` (see `initTimerEvents`). Use `interaction` for reliable user-seek position updates.
- Native `seeking` event is unreliable for immediate position updates (depends on browser buffering). Prefer `interaction` for user-initiated seeks.

### `unAll()` safety

`unAll()` only clears the WaveSurfer EventEmitter listeners (user-registered via `.on()`). It does NOT affect:
- Native DOM event listeners on `media` element (registered via `onMediaEvent`)
- Timer tick handlers (registered on `this.timer`)
- Renderer event handlers (registered on `this.renderer`)

### Methods used by Sequencer

`load(url)` (async), `play()` (async), `pause()`, `stop()`, `skip(seconds)`, `setVolume(0-1)`, `getCurrentTime()`, `getDuration()`, `on(event, cb)`, `unAll()`

### `triggerPlaying` event detail

The `sequencer:playing` CustomEvent only includes `{ url }` in its detail — it does NOT include `title`. The title is set later via `sequencer:position` events which include `{ url, title, duration, position }`.

### In-memory playback (v7 migration)

WaveSurfer v5 used `loadDecodedBuffer()` to load entire audio files into memory as AudioBuffers, enabling instant seeking with no buffering delays. v7 removed this API in favor of `load(url)`, which uses progressive streaming via HTML5 `<audio>`. This caused 5-10 second buffering delays when seeking.

**Solution**: Convert decoded AudioBuffer to WAV Blob URL for in-memory playback:
1. BuffersLoader decodes audio to AudioBuffer (via `AudioContext.decodeAudioData()`)
2. Sequencer converts AudioBuffer to WAV Blob (`_audioBufferToBlob()`)
3. WaveSurfer loads from Blob URL (`load(blobUrl)`)
4. Blob URL is revoked on track change to free memory

This restores v5's instant seeking behavior while using v7's API. Trade-off: higher memory usage (entire file in RAM), but eliminates seek buffering completely.
