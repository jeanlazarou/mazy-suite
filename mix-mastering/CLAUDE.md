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

`pkg/engine.MasteringEngine` chains processors in order. `NewWithDefaults()` creates EQ → Compressor → Limiter. `NewFullChain()` (used by the CLI and WASM bridge) creates EQ → Bass Exciter → Stereo Widener → Compressor → Treble Exciter → Loudness Normalizer → Gain → Limiter; the limiter must stay last so its ceiling holds on the actual output. The normalizer starts disabled in `NewFullChain` (the web bridge enables it; the CLI enables it when a preset configures it). The Bass and Treble Exciters (`pkg/dsp/exciter.go`) also start disabled — they generate harmonics that aren't in the source (creative, not corrective), so the default chain stays transparent; recommendations and presets switch them on via their `enabled` param when a target profile calls for it (phone/bluetooth/car). Bass excitement sits before the Stereo Widener so synthesized lows stay centered; treble excitement sits after the Compressor to restore sparkle gain reduction tends to dull. Processors are addressed by name string (e.g., `"Parametric EQ"`, `"Compressor"`). Processors whose coefficients depend on sample rate implement `dsp.SampleRateAware`; `engine.SetSampleRate` propagates rate changes. The studio UI's pipeline strip (`ProcessorPipeline.tsx`) renders this real order dynamically via `wasmGetProcessorNames` rather than a hand-maintained list, since Go's JSON map serialization is alphabetical and can't otherwise convey chain order.

`dsp.LUFSMeter` follows ITU-R BS.1770-4 (gated integrated loudness, K-weighted momentary/short-term, EBU Tech 3342 loudness range, 4x-oversampled true peak). The limiter computes its gain envelope offline (sliding-window minimum over the lookahead + release smoothing + moving-average attack), guaranteeing the ceiling with zero latency. Conformance tests for these guarantees live in `pkg/dsp/conformance_test.go`.

### I/O Registry Pattern

`pkg/io` uses a registry: each format file (wav.go, flac.go, mp3.go, ogg.go, aiff.go) calls `RegisterReader`/`RegisterWriter` in its `init()`. `ReadAudio`/`WriteAudio` dispatch by file extension. WAV is the only format with a native pure-Go writer; FLAC writing shells out to the `flac` CLI.

### Preset System

`pkg/preset` uses `go:embed` to bundle `builtins/*.json` into the binary. Presets are maps of processor name → param name → value. The Manager also loads from `~/.audiomaster/presets/` for user presets. Processor param names must match exactly (e.g., EQ uses `band.{i}.freq`, `band.{i}.gain`, `band.{i}.q`, `band.{i}.enabled`). EQ bands 0 (high-pass) and 5 (low-pass) start disabled so the default chain is transparent — presets that use them must set `band.{i}.enabled: 1`. The loudness normalizer param is `target_lufs`.

### WASM Bridge

`cmd/wasm/main.go` registers global JS functions (`window.wasm*`) via `syscall/js`. Every callback is wrapped in `safeCall()` with `defer recover()` — a panic in one call must not crash the Go runtime. Float32Array data is copied byte-by-byte respecting `byteOffset` for buffer views. The Go runtime stays alive via `<-make(chan struct{})`.

`pkg/wasm.Bridge` converts between interleaved float32 (JS) and per-channel float64 (Go), and serializes analysis/preset data as JSON strings.

### Web UI

React + TypeScript + Vite + Material UI. State in Zustand (`web/src/store/store.ts`). The Go WASM engine runs in a Web Worker (`web/src/wasm/engine.worker.ts`) so processing never blocks the UI; `web/src/wasm/engine.ts` is the promise-based RPC client (all engine methods are async, Float32Array arguments are transferred/consumed). The worker fetches `/wasm_exec.js` (copied from GOROOT by build.sh) and evals it — Vite blocks importing public files as modules.

A/B playback routes through a shared gain node; the "Match" toggle plays the processed buffer trimmed to the original's integrated LUFS (`matchGainDB` in the store, measured via `wasmMeasureLoudness`). Compressor/limiter panels show per-run gain-reduction stats from `wasmGetMeters`.

Loading multiple files creates an album: `tracks` in the store hold decoded buffers + cached analysis/gating blocks; the single-track fields always mirror the active track so the rest of the UI is album-agnostic. Album loudness mode (default when >1 track) disables per-track normalization and applies one shared offset via the chain's Gain stage. The offset comes from a calibration pass on first Process after settings change: every track runs through the current chain (limiter off), blocks are integrated as one program (`wasmMeasureBlocks` + `wasmGatedLoudness`), cached under a settings key (`albumCalKey`).

The Chain X-Ray is a full-screen view (replaces the studio while open; no playback) showing the signal at every stage of the chain as stacked lanes, each switchable between waveform (red columns = 0 dBFS) and spectrogram (48 log bands, 30 Hz–20 kHz). `engine.ProcessWithTaps` fires a callback after each enabled processor; `wasmProcessBufferStages` returns processed audio plus per-stage bucketed min/max/RMS envelopes and optional STFT spectrograms (all computed Go-side — never ship full per-stage audio across the worker boundary). Lanes recompute via a debounced effect whenever the settings key (params + bypass + track + album mode) stops matching `xrayStagesKey` — editing a stage from its lane (settings drawer reuses the processor panels) ripples through all following lanes. Setups are named param snapshots with their stage capture (and the settings key it was made under, `xraySettingsKey` in useAudioEngine.ts); applying one re-applies its params and, when the capture key matches, restores the lanes *and meters* instantly (no reprocessing) — clicking between setup chips is an immediate visual A/B (blink comparison), which replaced an earlier overlay-diff design that read poorly. Restoring meters alongside stages matters: the lane GR readout comes from live `meters` state, not from the stage envelopes, so it would otherwise show the wrong setup's numbers after an instant flip. `computeXrayStages` syncs `store.params` from the engine (`setParams(await engine.getParams())`) *before* computing the settings key it commits — necessary because it may be the first call ever to touch the WASM engine (loading a file only runs analysis, not the chain), so `store.params` can still be `{}` when the run starts; committing a key derived from stale/empty params would corrupt every setup saved from it. A generation counter (`xrayRunSeq`) discards results from superseded runs so rapid edits can't let a slow stale computation overwrite a newer one. "Process & listen" exits to the studio, runs the normal processing path and switches to B. Opened from the transport bar (single track) or a per-row button in the album table (which activates that track); opening stops playback via the module-level `stopPlayback()` in usePlayback.

With an album loaded, recommendations are computed from an aggregate of all track analyses (`analysis.Aggregate` via `wasmGetAlbumRecommendations`) and the Apply button reads "Apply to Album" — settings are shared, so applying per track would just overwrite. "Export album" masters every track with the current settings and downloads one zip (store-only writer in `web/src/audio/zip.ts`).

**Key pattern**: zustand selectors must not use `|| {}` for missing params (creates new object each render → infinite loop). Use `?? EMPTY_PARAMS` with a stable singleton from `store/constants.ts`.

Audio flows: file → Web Audio `decodeAudioData` → `AudioBuffer` → interleave to Float32Array → WASM `processBuffer` → deinterleave back → processed `AudioBuffer` for A/B playback.

### Analysis & Recommendations

`pkg/analysis` provides FFT spectrum, dynamics (peak/RMS/crest), stereo field (correlation/width), and LUFS measurement. `recommend.go` maps 6 target profiles (neutral, headphones, car, studio, phone, bluetooth) to EQ/compression/loudness/exciter suggestions based on analysis results. `Recommend()` always emits a Bass Exciter and Treble Exciter block (with `enabled: 0` for profiles that don't want them) rather than omitting the block when the amount is zero — otherwise re-targeting (e.g. phone → studio) couldn't turn a previously auto-enabled exciter back off.

## CLI

Built with Cobra. Commands: `process`, `analyze`, `preset list|search|show`, `batch`, `album`, `version`.

`album` masters a directory as one album: every track gets the same chain, and loudness is normalized by a single shared gain offset computed from the album's integrated loudness (BS.1770 gating blocks concatenated across tracks via `dsp.GatedLoudness`), preserving relative track levels. `batch` normalizes each file independently — use `album` for related tracks.

## Param Naming Conventions

- EQ: `band.{0-5}.freq`, `band.{0-5}.gain`, `band.{0-5}.q`
- Compressor: `threshold`, `ratio`, `attack`, `release`, `knee`, `makeup`
- Limiter: `ceiling`, `release`, `lookahead`
- Stereo Widener: `width`
- Mid/Side: `mid_gain`, `side_gain`
- Bass/Treble Exciter: `frequency`, `drive`, `mix`, `enabled` (like EQ's `band.{i}.enabled`, lets presets/recommendations switch them on — they start disabled)
- Loudness: `target_lufs`
- Gain: `gain_db`
