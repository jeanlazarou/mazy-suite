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

`pkg/engine.MasteringEngine` chains processors in order. `NewWithDefaults()` creates EQ → Compressor → Limiter. `NewFullChain()` (used by the CLI and WASM bridge) creates EQ → Stereo Widener → Compressor → Loudness Normalizer → Limiter; the limiter must stay last so its ceiling holds on the actual output. The normalizer starts disabled in `NewFullChain` (the web bridge enables it; the CLI enables it when a preset configures it). Processors are addressed by name string (e.g., `"Parametric EQ"`, `"Compressor"`). Processors whose coefficients depend on sample rate implement `dsp.SampleRateAware`; `engine.SetSampleRate` propagates rate changes.

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

With an album loaded, recommendations are computed from an aggregate of all track analyses (`analysis.Aggregate` via `wasmGetAlbumRecommendations`) and the Apply button reads "Apply to Album" — settings are shared, so applying per track would just overwrite. "Export album" masters every track with the current settings and downloads one zip (store-only writer in `web/src/audio/zip.ts`).

**Key pattern**: zustand selectors must not use `|| {}` for missing params (creates new object each render → infinite loop). Use `?? EMPTY_PARAMS` with a stable singleton from `store/constants.ts`.

Audio flows: file → Web Audio `decodeAudioData` → `AudioBuffer` → interleave to Float32Array → WASM `processBuffer` → deinterleave back → processed `AudioBuffer` for A/B playback.

### Analysis & Recommendations

`pkg/analysis` provides FFT spectrum, dynamics (peak/RMS/crest), stereo field (correlation/width), and LUFS measurement. `recommend.go` maps 5 target profiles (headphones, car, studio, phone, bluetooth) to EQ/compression/loudness suggestions based on analysis results.

## CLI

Built with Cobra. Commands: `process`, `analyze`, `preset list|search|show`, `batch`, `album`, `version`.

`album` masters a directory as one album: every track gets the same chain, and loudness is normalized by a single shared gain offset computed from the album's integrated loudness (BS.1770 gating blocks concatenated across tracks via `dsp.GatedLoudness`), preserving relative track levels. `batch` normalizes each file independently — use `album` for related tracks.

## Param Naming Conventions

- EQ: `band.{0-5}.freq`, `band.{0-5}.gain`, `band.{0-5}.q`
- Compressor: `threshold`, `ratio`, `attack`, `release`, `knee`, `makeup`
- Limiter: `ceiling`, `release`, `lookahead`
- Stereo Widener: `width`
- Mid/Side: `mid_gain`, `side_gain`
- Loudness: `target_lufs`
- Gain: `gain_db`
