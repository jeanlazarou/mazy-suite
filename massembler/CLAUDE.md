# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Massembler is a web-based multi-track audio sequencer built with React, TypeScript, and the Web Audio API. It allows users to upload audio files, create clips, and arrange them on a multi-track timeline with mixing capabilities.

## Development Commands

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview

# Run linter
pnpm lint

# Run the tests (or keep them running with test:watch)
pnpm test
```

## Testing
Vitest, configured in `vite.config.ts`; test files sit next to the code
(`src/**/*.test.ts`). They run in Node, without a browser:
- `src/test/mockAudio.ts` stands in for the Web Audio API and records what is
  scheduled; its clock only moves when a test sets `currentTime`.
- `src/test/setup.ts` gives every file an in-memory `localStorage`.
- Autosave runs against `fake-indexeddb`; only `setTimeout` is faked there,
  since the fake database works on `setImmediate`.

The tests are type-checked by `pnpm build` along with the app, which targets
ES2020: no `Array.prototype.at` (use `last()` from the mock helpers).

## Architecture Overview

### State Management
The entire application state is managed by a single Zustand store in `src/store.ts`. This centralized store handles:
- Audio files and clips
- Tracks and timeline state
- Playback control
- Undo/redo functionality
- Project metadata

Key store actions follow patterns like `addAudioFile`, `createClip`, `updateTrackClip`, etc.

Components subscribe to the fields they use with `useStoreFields('tracks',
'addTrack', ...)` (or `useStore` with a selector), never the whole store with
`useStore()`: the playhead updates the store every frame while playing, and a
whole-store subscription redraws the component each time (a conventions test
checks). Event handlers that only need a value at that moment read
`useStore.getState()`.

### Core Data Flow
1. **Audio Upload**: Files are processed into AudioBuffers and stored as `AudioFile` objects
2. **Clip Creation**: Users select regions to create `AudioClip` objects
3. **Track Arrangement**: Clips become `TrackClip` instances when placed on tracks
4. **Playback**: The audio engine (`src/utils/audioEngine.ts`) reads track state and renders audio

### Component Hierarchy
```
App.tsx
├── ClipLibrary.tsx (sidebar)
├── Timeline.tsx
│   └── Track.tsx
│       └── TrackClipBlock.tsx
├── PlaybackControls.tsx
└── ProjectActions.tsx (save/load/export)
```

### Key Utilities
- `src/utils/audioEngine.ts`: Web Audio API integration for playback and rendering
- `src/utils/projectManager.ts`: Project save/load (.mass files) and WAV export
- `src/utils/undoRedo.ts`: Undo/redo history, kept as snapshots of tracks, clips and audio files
- `src/utils/clipSelection.ts`: The Waveform Editor's selecting, zooming and
  looping-playhead maths, kept pure so it is tested; the editor
  (`WaveformEditorModal`, opened from the library's Audio Files list) is the
  one place clips are made
- `src/utils/autosave.ts` / `sessionStore.ts`: Keeps the open project in
  IndexedDB a second after each change, and offers it back on startup
  (`RestoreSessionDialog`). Saving starts only after that offer is answered.

## Important Patterns

### Adding New Features
When adding features that modify state:
1. Add the action to the store in `src/store.ts` and call it from components
2. Undo needs nothing more: every change to `tracks`, `clips` or `audioFiles`
   is recorded as a snapshot (by reference: no audio is copied, but a removed
   file stays in memory while the history can bring it back). Project name,
   zoom, selection and playback are not part of the history.
3. A drag should be one undo step: call `history.beginGesture()` on mousedown
   and `history.endGesture()` on mouseup.
4. A control that fires in bursts (knob, text or number field) wraps its
   store call in `history.coalesced(key, ...)`, the key naming the control,
   so a burst of edits is one step.

### Working with Audio
- All audio processing uses Web Audio API
- One audio context for the whole app: get it with the store's
  `ensureAudioContext()`, never `new AudioContext()` (a conventions test
  checks). Each open context holds an audio device.
- AudioBuffers are the primary audio data format
- The audio engine handles real-time playback and offline rendering

### Styling
- Uses Tailwind CSS for utility classes
- Dark theme by default (configured in `index.css`)
- Material UI components for complex UI elements

## Project File Format
`.mass` files are ZIP archives containing:
- `project.json`: Serialized application state
- `audio/`: Directory with all audio files as WAV

## Common Tasks

### Adding a new track operation
1. Define the action in the store
2. Create UI controls in Track component (gesture or coalesced, as above)
3. Update types if needed

### Modifying audio playback
- `src/utils/scheduler.ts` turns the arrangement into scheduled nodes (clip
  passes, fades, effects). Playback and WAV export both use it, so change
  scheduling there, never in one of them only. A pass may reach before its
  clip's start or past its end for a crossfade at a join
  (`utils/crossfades.ts`); clips themselves never overlap on a track.
- `src/utils/audioEngine.ts` runs realtime playback: a gain and a panner per
  track (muted tracks too, at zero) so volume/pan/mute/solo follow live, all
  through one master gain and the meters' analysers; `replay` reschedules
  mid-play with a short crossfade. A loop is scheduled one pass at a time,
  1.5 s ahead, each pass fading in and out over 5 ms at the joins; the
  position maths is in `utils/loop.ts`. Export builds the same mix offline.
- `src/utils/transport.ts` owns the engine and the playhead loop: `play`,
  `pause`, `stop`, `seek`, `togglePlay` for the buttons, seek bar, ruler and
  Space key, and decides when edits made while playing need a `replay`.

### Snapping
`src/utils/snapping.ts` holds the targets (clip edges on every track, the
playhead, zero) and the maths; `TrackClipBlock` (drag, resize) and `Track`
(library drop) apply it. Compare timeline positions with `spansOverlap` /
`OVERLAP_EPSILON` from `clipTiming.ts`, so clips snapped edge to edge do not
read as overlapping.

### The tour
`src/components/AppTour.tsx` holds the steps (`@reactour/tour`, as in the
player). Each step anchors to a `data-tour="..."` attribute on an element that
exists even in an empty project, since the tour starts by itself on a first
visit (`App`, via `utils/tourState.ts`). Moving or renaming one of those
elements means keeping its `data-tour` attribute.

### Changing project save/load
Modify `src/utils/projectManager.ts` - handles:
- State serialization
- File compression with JSZip
- Audio file conversion