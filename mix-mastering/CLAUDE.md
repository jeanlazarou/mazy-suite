# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Test Commands

```bash
# Full build (tests + CLI + WASM + web UI)
./build.sh

# Go tests
go test ./pkg/... -v                                # all packages
go test ./pkg/dsp -v                                # single package
go test ./pkg/engine -run TestEngineProcess -v      # single test

# Build targets individually
go build -o bin/master ./cmd/master/                                    # CLI
GOOS=js GOARCH=wasm go build -o web/public/engine.wasm ./cmd/wasm/     # WASM
cd web && npx vite build                                                # Web UI

# Dev server
cd web && npx vite
```

## Architecture

**Go audio mastering engine** exposed via CLI (`cmd/master/`) and WebAssembly (`cmd/wasm/`) to a React web UI (`web/`).

### DSP Pipeline

All processors implement `pkg/dsp.Processor` — the central interface with `Process(buf *AudioBuffer)`, `SetParam/GetParam`, `Name`, `Reset`, `Enabled`. `AudioBuffer` holds `[][]float64` (channel-major, float64 internally; float32 only at I/O and WASM boundaries).

`pkg/engine.MasteringEngine` chains processors in order. `NewWithDefaults()` creates EQ → Compressor → Limiter. `NewFullChain()` (used by the CLI and WASM bridge) creates EQ → Saturation → Bass Exciter → Stereo Widener → Compressor → Treble Exciter → Loudness Normalizer → Gain → Limiter; the limiter must stay last so its ceiling holds on the actual output. The normalizer starts disabled in `NewFullChain` (the web bridge enables it; the CLI enables it via the recipe or when a saved preset configures it). The Bass and Treble Exciters (`pkg/dsp/exciter.go`) also start disabled — they generate harmonics that aren't in the source (creative, not corrective), so the default chain stays transparent; recipes (destination phone/bluetooth/car) and presets switch them on via their `enabled` param. Bass excitement sits before the Stereo Widener so synthesized lows stay centered; treble excitement sits after the Compressor to restore sparkle gain reduction tends to dull. Saturation (`pkg/dsp/saturation.go`, the Warm version's analog color) also starts disabled: an asymmetric tanh with unit slope at zero (mostly 2nd harmonic), where only the distortion (curve − input) is computed at 2x oversampling and added to the untouched dry signal — no aliasing, no coloring of the dry path, zero latency (linear-phase halfband filters applied over the whole buffer). Its curve has a TS copy in `SaturationPanel.tsx` — keep in sync. Processors are addressed by name string (e.g., `"Parametric EQ"`, `"Compressor"`). Processors whose coefficients depend on sample rate implement `dsp.SampleRateAware`; `engine.SetSampleRate` propagates rate changes. The studio UI's pipeline strip (`ProcessorPipeline.tsx`) renders this real order dynamically via `wasmGetProcessorNames` rather than a hand-maintained list, since Go's JSON map serialization is alphabetical and can't otherwise convey chain order.

`dsp.LUFSMeter` follows ITU-R BS.1770-4 (gated integrated loudness, K-weighted momentary/short-term, EBU Tech 3342 loudness range, 4x-oversampled true peak). The limiter computes its gain envelope offline (sliding-window minimum over the lookahead + release smoothing + moving-average attack) from the per-sample *true* peak (the meter's 4x interpolator, shared via `truePeakEnvelope` with a precomputed kernel), then re-measures and limits again where small inter-sample overshoots remain, with a whole-buffer trim as backstop — so the ceiling is a dBTP guarantee, with zero latency. Conformance tests for these guarantees live in `pkg/dsp/conformance_test.go`.

### I/O Registry Pattern

`pkg/io` uses a registry: each format file (wav.go, flac.go, mp3.go, ogg.go, aiff.go) calls `RegisterReader`/`RegisterWriter` in its `init()`. `ReadAudio`/`WriteAudio` dispatch by file extension. WAV is the only format with a native pure-Go writer; FLAC writing shells out to the `flac` CLI.

### Preset System

There are no built-in presets — built-in settings come from recipes (below). `pkg/preset` only manages user presets: maps of processor name → param name → value, loaded from `~/.audiomaster/presets/` (CLI `--preset`). The web UI's saved presets are separate (localStorage). Processor param names must match exactly (e.g., EQ uses `band.{i}.freq`, `band.{i}.gain`, `band.{i}.q`, `band.{i}.enabled`). EQ bands 0 (high-pass) and 5 (low-pass) start disabled so the default chain is transparent — presets that use them must set `band.{i}.enabled: 1`. The loudness normalizer param is `target_lufs`.

### WASM Bridge

`cmd/wasm/main.go` registers global JS functions (`window.wasm*`) via `syscall/js`. Every callback is wrapped in `safeCall()` with `defer recover()` — a panic in one call must not crash the Go runtime. Float32Array data is copied byte-by-byte respecting `byteOffset` for buffer views. The Go runtime stays alive via `<-make(chan struct{})`.

`pkg/wasm.Bridge` converts between interleaved float32 (JS) and per-channel float64 (Go), and serializes analysis/preset data as JSON strings.

### Web UI

React + TypeScript + Vite + Material UI. State in Zustand (`web/src/store/store.ts`). The Go WASM engine runs in a Web Worker (`web/src/wasm/engine.worker.ts`) so processing never blocks the UI; `web/src/wasm/engine.ts` is the promise-based RPC client (all engine methods are async, Float32Array arguments are transferred/consumed). The worker fetches `/wasm_exec.js` (copied from GOROOT by build.sh) and evals it — Vite blocks importing public files as modules. Both engine files are fetched with `?v=<content hash>` (`__ENGINE_VERSION__`, computed in vite.config.ts from public/engine.wasm + wasm_exec.js — so build the WASM *before* `vite build`): public files keep fixed URLs and GitHub Pages caches them for 10 minutes, so without it a fresh deploy could pair the new bundle with a cached old engine ("unknown WASM function").

**Versions** (track workspace only; `wasm/variantPool.ts`): the four variants of the current choice are rendered in full, in parallel, each by its own `AudioEngine` instance (a separate worker + Go runtime; up to 4 at once, ~1 GB each on a 4-minute song — the app is used on desktops only), selected version first. Renders are cached in `store.renders` under `renderKey` (sorted params + bypass + track) and are playable before their result analysis arrives (`completeRender`). App's auto-preview shows a cached render of the current settings at once (even over a run in flight, whose result runProcess then drops) and waits instead of rendering when `variantPending` (the pool is still making exactly these settings) — so picking a version swaps buffers in ~100 ms. The pool restarts when the track, analysis, style, destination or fix change (not the variant), terminating workers mid-render; it stops in an album. Manual edits render through the normal path; clicking a version drops them like any choice change. Because a cached version is shown without a run, `syncRecipe` reloads the engine from the store (`restoreActiveEngine`) as soon as it applies a recipe to the active track — knob edits read the engine's params back (`setParams(await engine.getParams())`), so a stale engine would silently reset the whole chain on the first edit.

A/B playback routes through a shared gain node; the "Match" toggle plays the processed buffer trimmed to the original's integrated LUFS (`matchGainDB` in the store, measured via `wasmMeasureLoudness`). Compressor/limiter panels show per-run gain-reduction stats from `wasmGetMeters`.

**Track vs. album is an explicit choice** (`store.workspace`), never inferred from how many files are loaded: the start screen (`FileDropZone.tsx`) offers *Master a track* / *Master an album* (several files dropped on the track card also mean album); in the track workspace the transport's *Open another track* **replaces** the track (`store.openTrack`; the choice and a loaded saved preset carry over) and *Make an album* adds tracks (`store.addTracks`, which re-sorts a new album by file name). Header *New* (`closeSession`) returns to the start screen. `audio/loadFiles.ts` has one entry point per intent.

`tracks` in the store hold decoded buffers, cached analysis/gating blocks and **per-track settings** (`TrackSettings`: params, bypass, recipe, saved preset, edits, plus album-only style override, level nudge and "checked"). The global `params`/`processorEnabled`/`recipe`/`recipeKey`/`customPreset`/`paramsEdited` are the *active* track's live copy, so every panel, the X-Ray and the live preview work on "the current track" unchanged: `setActiveTrack` writes them back into the track and loads the next one's; read any track's settings with `trackSettingsOf`, change them with `setTrackSettings` (which also updates the live copy for the active track). App re-pushes the active track's settings to the engine on track switch (`syncEngineToActive`) — knob edits read engine params back.

The album screen (`components/album/AlbumView.tsx`) follows how albums are mastered: **1 The release** (destination and the album's usual style, shared — `store.choice`), **2 Each track** (track list + the active track's own style override, its fixes from *its own* analysis, edits, presets; tracks get a check once their preview rendered), **3 Album balance** (`BalancePanel.tsx`: levels in play order relative to the target, tone outliers vs. the album median from the calibrated spectra, ±dB nudges, reorder, end-of-one-into-start-of-next transition previews, export). In an album the normalizer is not used: each track gets an explicit gain (`albumTrackGainDB`): with *Keep the level differences* (`albumMode`, default) the shared offset `target − album loudness`, else `target − track loudness`, plus its nudge. Album loudness comes from `ensureAlbumCalibration`: every track through its own chain (limiter off, gain 0), gating blocks + a result analysis cached per track under its settings (`albumCal`, `calKeyFor`) so editing one track re-measures only that one, then all blocks integrated as one program (`wasmGatedLoudness`). Other tracks' changes bump `albumRev` (they move the shared offset), which marks the active preview stale. Transitions render only the needed seconds per track (`renderAlbumPart`, 1.5 s pre-roll for the compressor) and play through `audio/transition.ts`, straight to the analyser (no A/B match gain or live-preview stage). Anything that runs other tracks through the engine ends with `restoreActiveEngine`.

The Chain X-Ray is a full-screen view (replaces the studio while open; no playback) showing the signal at every stage of the chain as stacked lanes, each switchable between waveform (red columns = 0 dBFS) and spectrogram (48 log bands, 30 Hz–20 kHz). `engine.ProcessWithTaps` fires a callback after each enabled processor; `wasmProcessBufferStages` returns processed audio plus per-stage bucketed min/max/RMS envelopes and optional STFT spectrograms (all computed Go-side — never ship full per-stage audio across the worker boundary). Lanes recompute via a debounced effect whenever the settings key (params + bypass + track + album mode) stops matching `xrayStagesKey` — editing a stage from its lane (settings drawer reuses the processor panels) ripples through all following lanes. Setups are named param snapshots with their stage capture (and the settings key it was made under, `xraySettingsKey` in useAudioEngine.ts); applying one re-applies its params and, when the capture key matches, restores the lanes *and meters* instantly (no reprocessing) — clicking between setup chips is an immediate visual A/B (blink comparison), which replaced an earlier overlay-diff design that read poorly. Restoring meters alongside stages matters: the lane GR readout comes from live `meters` state, not from the stage envelopes, so it would otherwise show the wrong setup's numbers after an instant flip. `computeXrayStages` syncs `store.params` from the engine (`setParams(await engine.getParams())`) *before* computing the settings key it commits — necessary because it may be the first call ever to touch the WASM engine (loading a file only runs analysis, not the chain), so `store.params` can still be `{}` when the run starts; committing a key derived from stale/empty params would corrupt every setup saved from it. A generation counter (`xrayRunSeq`) discards results from superseded runs so rapid edits can't let a slow stale computation overwrite a newer one. "Process & listen" exits to the studio, runs the normal processing path and switches to B. Opened from the transport bar (single track) or a per-row button in the album table (which activates that track); opening stops playback via the module-level `stopPlayback()` in usePlayback.

**Master settings** (`components/master/MasterPanel.tsx`) is the one place the sound is chosen, as three independent questions: *What is it?* (style, optional), *Where will it be heard?* (destination), and *Fix problems* (switch) — then, in the track workspace, *Pick a version* (Clean / Punch / Smooth / Warm cards with the analysis' suggestion; `choice.variant`, see Versions above). The store holds the `choice`; App's recipe-sync effect calls `syncRecipe` (useAudioEngine) whenever the choice or the analysis changes, which builds a recipe Go-side (`wasmBuildRecipe`) and applies **all** params and bypass states via `store.applySettings` (store is the source of truth; every run re-inits the engine from it). `recipeKey` (choice + track/album scope) skips rebuilds that change nothing; setting it to null ("Reset" after manual edits) forces one; `recipeSeq` cancels superseded builds. Saved presets ("My presets", localStorage, `audio/customPresets.ts`) replay a full param snapshot and set `customPreset`, which pauses recipe sync until a choice is clicked again. In an album every track gets its own recipe: the shared choice with the track's style override, and fixes from that track's own analysis; a saved preset loads onto the active track only, and changing the album's choice rebuilds every track (clearing presets on tracks).

There is no Process button: App's auto-preview effect reprocesses (debounced) whenever `paramsDirty` and settings exist; the transport bar shows "Updating preview… / Preview up to date". `runProcess` compares params/bypass/album-mode identity before and after a run and re-flags `paramsDirty` if they changed mid-run, and drops results if the track changed. Engine start-up in `useAudioEngine` is guarded by a module-level flag so it runs once per app — per-mount init used to read engine params back into the store from late-mounted components and silently wipe applied settings. "Export album" masters every track with the current settings and downloads one zip (store-only writer in `web/src/audio/zip.ts`).

Every processor panel has two views — a visual one and **Knobs** (`controls/PanelView.tsx`; choice per panel in localStorage `mm.view.<panel>`). Visual views edit through `controls/useDragParams.ts` (local overlay, one engine round trip per frame):
- **EQ — Curve** (`EQGraph.tsx`): drag points for freq/gain, wheel for Q, double-click on/off, frequency zones, whole-track original/result spectra plus the live analyser. `audio/eqMath.ts` is an exact TS port of the Go biquad formulas (`pkg/dsp/biquad.go`) — keep them in sync; the curves draw from it and the live preview runs it.
- **Compressor — Curve**: in/out transfer curve (TS copy of `computeGainReduction`, `compressorOut`) with draggable threshold and ratio, over a histogram of the detector levels, plus a gain-reduction strip across the track.
- **Limiter — Ceiling**: input true peaks across the track with a draggable ceiling line.
- **Stereo — Stage**: drag the width; predicted spread/correlation from the analysis; "Hold: mono check".
- **Exciters — Harmonics**: drag split frequency × mix over the spectrum; drive's tanh curve as an inset.
- **Saturation — Curve**: the transfer curve (drag up/down for drive) and the overtones it gives a loud note.

Compressor and limiter record a `dsp.DynamicsTimeline` (600 slices: highest detected level, most gain reduction), exposed by `wasmGetMeters` as `in_db`/`gr_db`. A processor's own threshold/ratio/knee/ceiling don't change its detected levels, so the views recompute "where and how much it works" instantly while dragging, before any render (the limiter estimate ignores lookahead/release spreading).

**Live preview** (`audio/livePreview.ts`): playback sources connect to `getPlaybackInputNode()`, where a stage holds the *difference* between the settings the processed buffer was rendered with (`store.processedSettings`, the snapshot `prepareEngineRun` actually applied) and the current ones, so edits are heard immediately while playing B; when the re-render lands the difference is empty. Only linear processors are bridged: EQ (IIR filters: inverse of each changed band, then its new setting; a moved high/low-pass can't be inverted) and Stereo Widener (L/R matrix scaling the side by w/w0). Approximate only in that later stages (compressor, limiter) would react slightly differently. The same section hosts EQ band solo and the mono check.

**Key pattern**: zustand selectors must not use `|| {}` for missing params (creates new object each render → infinite loop). Use `?? EMPTY_PARAMS` with a stable singleton from `store/constants.ts`.

Audio flows: file → Web Audio `decodeAudioData` → `AudioBuffer` → interleave to Float32Array → WASM `processBuffer` → deinterleave back → processed `AudioBuffer` for A/B playback.

### Recipes (style × destination × fixes)

`pkg/recipe` builds complete chain settings from a `Choice{Style, Destination, Fix, Variant}` and an analysis. Each layer owns a different part of the sound so they combine instead of overwriting: **style** (rock, pop, electronic, hiphop, jazz, acoustic, classical, voice) sets character — a tonal curve plus compressor attack/release/knee and a ratio/threshold bias; **destination** (release: streaming, podcast, loud, vinyl; device: headphones, car, phone, bluetooth) sets delivery — target LUFS, true-peak ceiling, compression density, width, device tone, exciters; **fixes** come from the analysis (dark/bright/mid-heavy, very wide or squashed dynamics, sharp peaks). EQ bands have fixed roles (1 low shelf 100 Hz, 2 peak 400 Hz, 3 peak 3 kHz, 4 high shelf 10 kHz; 0 high-pass only when the voice style or vinyl asks) and every layer adds dB to them. A recipe starts from `NewFullChain` defaults and carries every param and bypass state, so nothing is left over from earlier choices. "Podcast" the destination is about loudness (−16 LUFS); spoken-word EQ belongs to the *voice* style. Recipes always emit both exciter blocks with an explicit `enabled` so switching destination (phone → streaming) turns a previously enabled exciter back off.

**Variants** (clean, punch, smooth, warm — "versions" in the UI) are a finish on top of the other layers that never touches delivery: tone deltas on the same EQ bands, compressor attack/release multipliers and ratio/knee offsets, and for warm saturation plus a little bass excitement (max with the destination's). Clean adds nothing, so it equals the recipe without a variant; the summary names non-clean variants. `Suggest(style, analysis)` (also carried as `Recipe.suggested`) picks the one to try first: what the analysis hears wins (bright → smooth, mid-heavy → punch, LRA < 4 → clean, dark keeps jazz/acoustic from warm → clean), else the style (rock/hip-hop/electronic → punch, jazz/acoustic → warm, others clean). Albums are always built clean.

### Analysis

`pkg/analysis` provides FFT spectrum, dynamics (peak/RMS/crest), stereo field (correlation/width), and LUFS measurement. `Aggregate` combines per-track analyses into one album-level analysis (used for album recipes). Judge dynamics by `loudness.LoudnessRange` (LRA), not `Dynamics.DynamicRange`: the latter is loudest minus quietest window and reads ~80 dB on any song with a fade.

## CLI

Built with Cobra. Commands: `process`, `analyze`, `options`, `batch`, `album`, `preset list|search|show`, `version`. `process`, `analyze`, `batch` and `album` share the settings flags `--style`, `--for`, `--no-fix`, `--preset` (`cmd/master/settings.go`); with no flags they master for streaming with fixes. `process` also takes `--variant` (default clean; prints a tip with the suggested one); `options` lists styles, destinations and variants. `album` uses the album's style/destination for every track with fixes from each track's own analysis, and takes its target from the destination unless `--target-lufs` is given.

`album` masters a directory as one album: every track gets the album's style and destination (and its own fixes), and loudness is normalized by a single shared gain offset computed from the album's integrated loudness (BS.1770 gating blocks concatenated across tracks via `dsp.GatedLoudness`), preserving relative track levels. `batch` normalizes each file independently — use `album` for related tracks.

## Param Naming Conventions

- EQ: `band.{0-5}.freq`, `band.{0-5}.gain`, `band.{0-5}.q`
- Compressor: `threshold`, `ratio`, `attack`, `release`, `knee`, `makeup`
- Limiter: `ceiling`, `release`, `lookahead`
- Stereo Widener: `width`
- Mid/Side: `mid_gain`, `side_gain`
- Bass/Treble Exciter: `frequency`, `drive`, `mix`, `enabled` (like EQ's `band.{i}.enabled`, lets presets/recipes switch them on — they start disabled)
- Saturation: `drive` (0–1), `enabled` (starts disabled)
- Loudness: `target_lufs`
- Gain: `gain_db`
