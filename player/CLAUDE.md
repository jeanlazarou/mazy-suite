# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm start          # Dev server (CRA, port 3000)
pnpm build          # Production build
pnpm test           # Vitest (single run)
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

- **Timeline.js** — Optional chronology, oldest first, grouped by year. It sits in a narrow column to the right of the description when there is room and stacks under it otherwise (`.description-layout` / `.description-layout-split` in `DescriptionThemes.css`). It reads the current theme's `--desc-*` custom properties, falling back to its own palette for the plain rendering, so it belongs to whichever theme the album picked. Its class names are all `timeline-*` prefixed: the old `.track-title` / `.track-date` / `.track-artists` were bare selectors that also landed on the playlist cards (see the note at the end of `index.css`).

- **LyricsSubtitle.js** — Synchronized lyrics display. `LyricVerse` listens directly for `sequencer:position` document events (NOT via Recoil) and uses `sortedIndexBy` binary search on SRT-parsed timings to find the current verse. Lyrics are loaded from `./data/lyrics/{title}.srt` via a Recoil `selectorFamily`.

### Persistence

- **localStorage**: user preferences (`player-options`), feature flags (`player-features`), per-track state (`playlist.track.{url}`), track order (`playlist.order.{title}`)
- **IndexedDB**: audio file metadata cache (`playlist-db/Metadata`)

### Sequencer Events (document CustomEvents)

`sequencer:ready`, `sequencer:loaded`, `sequencer:load-error`, `sequencer:start`, `sequencer:playing`, `sequencer:paused`, `sequencer:continue`, `sequencer:stopped`, `sequencer:ended`, `sequencer:position`

### Playlist Loading

Query param `?list=name` loads `./data/{name}.json`. A sibling `.md` file is loaded for the description panel. Description markdown supports special tokens: `$T:song-title` (song marker), `$A` (authors), `$C` (creation date), `$AC` (authors + date), `$KIND:`/`$FROM:`/`$NOTE:` (where a song comes from), `$THEME:name` (rendering theme), and inline `<style>` blocks.

### Song origin markers

`$KIND:`, `$FROM:` and `$NOTE:` are parsed by `descriptionOrigin.js` and are the one part of the preprocessing that is **not** a per-line substitution: they are collected per song (keyed by the song's index, `-1` before the first `$T:`), their lines are dropped from the markdown, and the group is re-emitted as a single `<span class="description-origin">` in place of the first marker of the group. The emitted markup is inline spans, not a `<div>` — the block sits inside a list item, and inline HTML is what Remarkable passes through untouched; the stylesheet gives the outer span `display: block`. Dropping the consumed lines (rather than blanking them) matters: a blank line inside a list would turn the tight list loose.

Themes **opt in** to the origin block — `DescriptionThemes.css` sets `display: none` on `.description-themed .description-origin`, and `dossier` and `lineage` turn it back on. `sleeve`, `liner`, `minimal` and `neon` predate the marker and deliberately leave it out. The base (unthemed) styling of the block, including its dark-mode rules, is scoped with `:not(.description-themed)` so those id-level rules cannot outrank a theme's.

### Description themes

`$THEME:name` selects one of the themes listed in `descriptionThemes.js` and implemented in `DescriptionThemes.css`; the README documents them for description authors. `api.js` strips the marker in `preProcessDescription` and returns the theme alongside the rendered HTML; `DescriptionModal` turns it into `description-themed description-theme-{name}` classes on `#playlist-description`. The `default` gets `description-plain` instead — **not** `description-themed`, which is what keeps the app-wide dark-mode rule in `index.css` (`:not(.description-themed)`) in charge of it, while giving its own styling a class to hang off.

Specificity is load-bearing here: per-album `<style>` blocks use `#playlist-description x` selectors and are meant to beat both the theme rules and the plain ones, so neither ever uses `!important` and neither raises specificity beyond `#playlist-description.description-theme-x`. In particular the plain rules are written `.description-plain .description-body x` (class-level) rather than off the id.

`prism` and `orbit` lay songs out by position — a hue per track, a ring around the cover — so `DescriptionModal`'s `numberSongs` sets `--song-index` on every song and `--song-count` on the list (and on the body, which the cover image needs and cannot inherit from the list). CSS has no sibling count, hence the layout effect; it re-runs on content change.

**The `dangerouslySetInnerHTML` prop object must be memoised.** React 19 re-applies it whenever the *prop object* identity changes, not when the HTML string does — so a fresh `{ __html: … }` literal on every render re-parses the whole description and wipes everything `decorateBody` added to it. `Content` builds it with `useMemo` keyed on the content; without that, any re-render (toggling the timeline, a viewport change, any atom update) silently resets the description. The layout effect keys off that memoised object for the same reason.

Two other things keep the decorations alive: `Content` renders **one tree shape** whether or not the timeline is showing (a `description-layout` wrapper, the timeline a conditional child in a fixed slot) so the body is never remounted by the toggle, and the body carries a callback ref so a genuine remount re-decorates it.

`orbit` also needs the songs twice: titles on the ring, full details under it. `copySongDetails` clones the song list into a `.description-details` wrapper appended to the body, and **every** orbit ring rule is written `.description-body > .description-list …` so it matches only the original — the copy falls through to the theme skeleton's ordinary stacked list. The function removes any previous copy before adding one: the effect re-runs, and `index.js` renders under `React.StrictMode`, which invokes effects twice in development. Below 820px the ring is abandoned for a stacked list and the copy is hidden, so the album is never listed twice.

Panel sizing matters for themes: a **markdown** description must keep `min-height: 100%` with no fixed height, so the element grows past the viewport and its background stays under the whole list (a fixed height leaves the overflow sitting on `.modal-content`'s own background — invisible with the default palette, obvious with a theme). Its bottom breathing room is padding, not margin, for the same reason. An **HTML** description is the exception: it keeps `height: 100%` so the iframe fills the panel and scrolls internally.

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
