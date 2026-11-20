# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `pnpm dev` - Vite dev server (port 3000)
- `pnpm build` - production build into `build/` (static, `base: './'`)
- `pnpm test` - Vitest over `src/**/*.test.js` (the `src/core/` modules)
- `pnpm lint` - ESLint

## Architecture

A noise gate for vocal takes, built on the same structure as `../player_editor`:
React 19, Jotai atoms with no provider, actions in `src/actions/` as plain
functions taking `(get, set)` and wired through `useAtomCallback`, an
`AudioEngine` wrapping WaveSurfer.js v7 + Regions, `HotkeysMapping.js`, MUI.
JSX lives in `.js` files (see `vite.config.js`).

### `src/core/` — the gate, DOM-free

Everything that decides what the audio becomes is here, tested, with no browser
API. A plugin port (VST3/AU) would follow these files.

- `wav.js` - WAV decode/encode on the samples (16/24/32 int, 32/64 float,
  extensible). Integer scaling is symmetric (`x * 2^(n-1)`), so read + write at
  the same depth is bit-exact. The browser decoder is only the fallback for
  non-WAV files (it resamples to the AudioContext rate).
- `gate.js` - `analyzeLevels` (1 ms hops, centred 10 ms RMS, loudest channel,
  optional RBJ high-pass on the detector only), `levelStats` (10th/95th
  percentiles, digital silence excluded), `detectSilences`, `renderChannel`.
  **Fades are inside regions** and skipped at the file edges; everything
  outside regions is untouched.
- `regions.js` - the edit model. `combineRegions(detected, edits)`: detected
  regions minus manual ranges and keep zones, plus the manual ranges. Edits are
  `{ manual, keeps, next }`; accepting a resized region adds the range it gave
  back as a keep zone, deleting a region adds a keep zone. Manual ranges merge
  only when they overlap (split halves touch and stay apart);
  `mergeForRender` joins touching ones so no fade happens at a split.

### State (atoms)

- `Editor.js`: `currentRecording` ({ name, sampleRate, channels, duration,
  bitDepth, float, wav, peaks }), `loadingState`
- `GateSettings.js`: `gateParams` (persisted to localStorage, merged over
  `DEFAULT_PARAMS`), `levelAnalysis`, `gateEdits`, derived `detectedRegions`
  (via a `selectAtom` on the detection params only) and `gateRegions`
- `actions/regions.js`: `activeRegion` ({ id, origin, start, end, original,
  changed }), derived `effectiveRegions` / `renderedRegions` (the pending
  bounds of the active region included: preview and export hear them)
- `Waveform.js`: `audioEngine`, `audioState`, `audioPosition`, `editorMode`,
  `monitorMode` (gated/original/removed), `waveView` (wave/level)

Detected region ids (`auto-N`) are positional and change with any setting:
actions find a clicked region again **by time** after committing, and changing
a detection setting releases the active region.

Leaving the active region (selecting another, N/P, mode change, settings change)
**keeps** its change; only Esc cancels it.

### Playback and display

- `GatePlayer` subclasses WaveSurfer's `WebAudioPlayer`; the engine creates an
  AudioBuffer at the recording's rate, `waveSurfer.load("", [peaks], duration)`
  with our own peaks, so WaveSurfer never fetches or decodes. Edits re-render the
  buffer in place (`renderChannel` into `getChannelData`) and `refresh()`
  restarts the source node at the same position (a playing node keeps the
  samples it started with).
- Peaks are one value per block (WaveSurfer mirrors `|v|`): `wavePeaks` for the
  waveform, `levelPeaks` (dB mapped onto -90..0) for the level view. Switching
  views must go through `load()` again: `setOptions({ peaks })` redraws the old
  data in 7.12.
- Regions are diffed by id in `drawRegions` (setOptions in place), the active
  one drawn under the id `active`, draggable/resizable. Drag selection (edit
  mode) creates a region with id `drawn`, removed at once and turned into a new
  active region.
- Focus: buttons, chips and sliders are blurred on `pointerup` (Editor.js), and
  the Selects use `disableRestoreFocus`, so Space/Enter/arrows reach the hotkeys
  after a click.

## Toward a plugin

The offline detection is a look-ahead gate. In a streaming plugin, with times
in ms: closing needs to know the silence will last `minSilence`, decided
`keepAfter` after it started, so it needs `minSilence - keepAfter` ms of
lookahead. Opening starts the fade `keepBefore + fade` before the voice, so it
needs `keepBefore + fade` ms (a bit more when short regions shorten their
fades). The plugin reports roughly
`max(minSilence - keepAfter, keepBefore + fade) + WINDOW_MS / 2` as latency,
and the DAW compensates it on playback. Hand edits (manual regions, keep zones)
have no plugin equivalent; in a DAW they are automation or clip edits.
