# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

**Track Mixer** — a browser-based multitrack mixer for the Mazy Suite
(the repository root). It mixes a song's stems (all starting at
time 0, same length) into a stereo WAV. Not a DAW: no recording, no clip
arranging, no mastering (mastering is the sibling `mix-mastering` project).

**Read [SPECIFICATION.md](SPECIFICATION.md) first** — it defines the concepts,
UI, audio engine, mix-document JSON format, hotkeys and milestones.

## Key design decisions (do not re-litigate without asking)

- **No faders.** All level control is drawn on the waveform: breakpoint level
  lines, shift+drag mute regions, preset fades (fast/medium/slow).
- **One gain envelope per track internally.** Mute regions and fades are just
  segments/ramps of that single curve; the audio engine only evaluates one
  curve per track (`GainNode` + `setValueCurveAtTime`).
- **Micro-fades everywhere**: every hard edge gets a ~15 ms ramp so cuts never
  click.
- **Non-destructive**: the mix is a `mix.json` document referencing stem files;
  export renders via `OfflineAudioContext` to 16-bit WAV.
- Group lanes are VCA-style (their curve multiplies member tracks). Master is a
  lane like any other plus a clip-indicating meter. EQ is 3 bands only.

## Current state

**All milestones (M1–M5) implemented** — Vite + React 19 + zustand + pnpm, custom `<canvas>`
rendering (the WaveSurfer-plugins option was considered and rejected: its
Envelope/Regions plugins own their own models and can't draw one effective
gain curve or audio-less group/master lanes).

- `pnpm dev` / `pnpm test` (vitest) / `pnpm build`.
- M1: stacked lanes, level-line editing, shift+drag mute regions with
  micro-fades and edge-resize, fade presets 1/2/3, solo/mute, hotkeys, seek,
  A/B bypass, playback cursor overlay, WAV export, synthesized demo stems
  with per-track "Load…" for local files.
- M2: mix.json save (Ctrl+S, `src/model/mixdoc.js` serialize/parse per the
  spec format) and open (Ctrl+O — stems and/or mix.json in one picker,
  doc applied to tracks by file-name/slug match); snapshot undo/redo
  (Ctrl+Z/Y, `src/state/history.js`, past/future in the store, one step per
  drag gesture, history cleared when buffers are swapped). Solo is
  monitoring-only: not saved, not undoable; mute is both.
- M3: VCA-style group lanes ("+ Group" button; membership cycled via the
  color dot on track headers; collapse hides member lanes), per-track 3-band
  EQ (vertical mini-sliders, double-click resets, live filter updates without
  source restart via `engine.updateEq`), master meter + latched clip
  indicator (AnalyserNode after the master curve — reads what the export
  will contain). Playback and offline export share one `engine.buildGraph`.
  Group lanes are level-line only (no regions), per spec.
- M4: suite integration via the **suite bridge** (`vite-suite-bridge.js`, a
  dev/preview middleware — the browser must also *write* into `../data`):
  `GET /__suite/list` walks `data/stems/<album>/<song>/`, `GET/PUT
  /__suite/file/<path>` reads/writes data files (PUT restricted to mix.json
  and mixdown.wav). "Suite…" picker opens a song (stems + mix.json + SRT
  markers); Save writes mix.json next to the stems (download fallback when
  no suite song / no bridge); "Send to mastering" renders mixdown.wav into
  the song folder for the sibling mix-mastering CLI. SRT markers (song
  folder first, then `data/lyrics/<song>.srt`) draw on the ruler and snap
  breakpoints/region edges (~8 px); the Markers toggle also disables
  snapping. `data/stems/demo-album/Demo Song/` holds generated demo stems.
- M5: fade shapes (presets 1/2/3 = 50 ms linear / 0.5 s smoothstep / 2 s
  log power-curve, applied in `regionMask`); pan line per track (Pan toggle
  reroutes line gestures to the pan curve, v in −1..1, top = right,
  `StereoPannerNode` after EQ, in exports too); breakpoints are selectable
  like regions and ←/→ nudges the selection (0.01 s, Shift = 0.1 s); zoom
  (`view {start, duration}` in the store, Ctrl+wheel around pointer,
  horizontal/shift wheel pans, −/+/Fit buttons, cursor auto-follows,
  zoom-aware peak cache in `engine.getPeaks`).
- Post-M5: tracks can be **added** ("+ Track" appends stems from local files
  to the current session, unlike Ctrl+O which replaces it) and **removed**
  (× on the track header). Both are undoable: history snapshots include
  `durations`, and a removed track's buffer stays in the engine so undo can
  restore it. Hotkeys/gestures live in a help popup (?), not a footer.
  Layout: transport + ruler pinned top, master pinned bottom, track/group
  lanes scroll between (`.tracks-scroll`; ruler/master rows carry a 10 px
  right padding matching its stable scrollbar gutter so the time axis stays
  aligned — cursor and wheel zoom measure `.ruler-row .lane`).
- Post-M5: regions have a **type** — mute / fade-in / fade-out (T cycles it
  on the selected region) — and an **enable toggle** (E) to audition without
  deleting. Fade regions are pure ramps across the region (no effect
  outside; the boundary jump is softened by a micro-edge just inside, per
  the micro-fades rule). Serialized as `mode` / `enabled` on regions.
- `sketch/index.html` — the original dependency-free prototype, kept as an
  interaction-feel reference only.

## Code conventions

- **One user action per file in `src/actions/`** (player_editor convention):
  the folder listing *is* the app's feature list. Verb-first snake_case names.
  When the app grows, group into subfolders rather than merging files.
- `src/state/store.js` is state shape + selectors only — no actions in the
  store. Actions read/write via `useMixStore.getState()/setState()` and end
  with an explicit `engine.modelChanged()` side-effect. Exception: during
  drags the per-move actions skip it and the Lane component syncs once on
  pointer-up.
- Pure mix math lives in `src/model/` (unit-tested, no DOM/audio imports);
  Web Audio and AudioBuffers live only in `src/audio/engine.js`.
- No module-level mutable state in action files; transient drag state stays
  in the component driving the drag.

## Suite context

- Sibling `player_editor` — lyrics/timing editor; reuse its SRT parser for
  timeline markers, follow its hotkey conventions.
- Sibling `mix-mastering` — Go/WASM mastering tool; this app's exported WAV is
  its input.
- Suite data lives in `../data/` (per-album json/md/covers); stems are planned
  under `data/stems/<album>/<song>/` next to `mix.json`.
