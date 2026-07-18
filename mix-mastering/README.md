# Audio Mastering Studio

A professional audio mastering tool written in Go with a CLI and a React/WebAssembly web UI. Process audio through a configurable DSP chain (EQ, compression, limiting, stereo processing), analyze tracks, and get mastering recommendations tailored to target listening environments.

## Quick Start

```bash
# Build everything (CLI + WASM + Web UI)
./build.sh

# Process a file
./bin/master process input.wav -o output.wav --preset rock

# Analyze audio with target-specific recommendations
./bin/master analyze input.wav --target headphones

# List available presets
./bin/master preset list

# Launch the web UI
cd web && npx vite
```

## CLI Commands

| Command                                 | Description                                   |
| --------------------------------------- | --------------------------------------------- |
| `master process <file> -o <out>`        | Process audio through the mastering chain     |
| `master analyze <file> --target <t>`    | Analyze audio and get recommendations         |
| `master preset list [--category genre]` | List presets (filter by genre/target/usecase) |
| `master preset search <query>`          | Search presets by name, description, or tags  |
| `master preset show <name>`             | Show preset details as JSON                   |
| `master batch <dir> -o <outdir>`        | Batch process a directory of audio files      |

### Process flags

- `-o, --output` — Output file path (required)
- `-p, --preset` — Preset name to apply
- `-b, --bit-depth` — Output bit depth (16, 24, 32)
- `--eq`, `--comp`, `--limit` — Toggle individual processors

### Analyze targets

`headphones`, `car`, `studio`, `phone`, `bluetooth`

## Web UI

The web interface runs the Go DSP engine via WebAssembly in the browser. Features:

- Drag-and-drop audio file loading
- Real-time A/B comparison (original vs processed)
- Interactive EQ curve, knob controls for compressor/limiter/stereo
- Spectrum analyzer, waveform display, stereo field (Lissajous), LUFS meter
- Preset browser with search and filtering
- Analysis panel with per-target recommendations

## DSP Chain

1. **Parametric EQ** — 6-band (HPF, low shelf, 2× peak, high shelf, LPF)
2. **Compressor** — Soft-knee with attack/release envelope
3. **Limiter** — Lookahead brickwall limiter
4. **Stereo Widener** — Mid/side width control
5. **Loudness Normalizer** — LUFS-based normalization
6. **Multiband Compressor** — 3-band (low/mid/high)
7. **Harmonic Exciter** — Tanh saturation on high frequencies
8. **De-Esser** — Sibilance reduction with bandpass detection

## Supported Formats

| Format | Read | Write                     |
| ------ | ---- | ------------------------- |
| WAV    | Yes  | Yes                       |
| FLAC   | Yes  | Yes (requires `flac` CLI) |
| MP3    | Yes  | —                         |
| OGG    | Yes  | —                         |
| AIFF   | Yes  | —                         |

## Project Structure

```
cmd/master/       CLI application (cobra)
cmd/wasm/         WebAssembly entry point (syscall/js)
pkg/dsp/          DSP processors (all implement Processor interface)
pkg/engine/       Mastering engine / pipeline orchestration
pkg/io/           Audio file readers and writers
pkg/analysis/     Spectrum, dynamics, stereo, loudness analysis + recommendations
pkg/preset/       Preset system with go:embed built-ins
pkg/wasm/         JS↔Go bridge for WASM
web/              React + Vite + TypeScript + Material UI
```

## Building

Requires Go 1.21+ and Node.js 18+.

```bash
# Full build (tests + CLI + WASM + web)
./build.sh

# Tests only
go test ./pkg/... -v

# CLI only
go build -o bin/master ./cmd/master/

# WASM only
GOOS=js GOARCH=wasm go build -o web/public/engine.wasm ./cmd/wasm/
```

--------

<pre><font color="#FFFFFF">●</font> Sounds good. Here&apos;s a quick summary of where things stand:                                                                                                                                                                         
                                                                                                                                                                                                                                     
  <b>Working:</b>                                                                                                                                                                                                                           
  - Go backend: all 25 tests pass, CLI builds and runs (<font color="#99CCFF">process</font>, <font color="#99CCFF">analyze</font>, <font color="#99CCFF">preset</font>, <font color="#99CCFF">batch</font>)                                                                                                                                             
  - WASM: compiles (4.6MB), bridge has panic recovery                                                                                                                                                                                
  - Web UI: TypeScript compiles clean, Vite builds                                                                                                                                                                                   
                                                                                                                                                                                                                                     
  <b>Fixed</b> <b>during</b> <b>session:</b>
  - Zustand infinite re-render loop (<font color="#99CCFF">||</font> <font color="#99CCFF">{}</font> → <font color="#99CCFF">??</font> <font color="#99CCFF">EMPTY_PARAMS</font>)
  - WASM &quot;already exited&quot; crash (GC&apos;d Go instance + missing panic recovery + bad <font color="#99CCFF">byteOffset</font> handling)

  <b>To</b> <b>validate</b> <b>when</b> <b>you</b> <b>return:</b>
  1. <font color="#99CCFF">cd</font> <font color="#99CCFF">web</font> <font color="#99CCFF">&amp;&amp;</font> <font color="#99CCFF">npx</font> <font color="#99CCFF">vite</font> → load a file → click Process → check A/B playback works
  2. Click Analyze → verify recommendations appear
  3. Try applying a preset then processing

  If you hit issues, the browser console will now show <font color="#99CCFF">&quot;WASM</font> <font color="#99CCFF">panic:</font> <font color="#99CCFF">...&quot;</font> messages instead of silent crashes.
</pre>