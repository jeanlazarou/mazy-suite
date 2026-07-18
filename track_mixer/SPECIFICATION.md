# Track Mixer

## Project Overview

A browser-based **multitrack mixer** for the Mazy Suite. It mixes the stems of a
finished song (drums, bass, vocals, …) into a stereo mixdown. All stems start at
time 0 and have the same length — this is *not* a DAW and *not* an arranger.

The central idea is the UI: instead of channel faders, every mixing decision is
**drawn directly on the waveform** as a level line (breakpoint volume
automation, like Audacity's envelope tool). A fader shows one instant in time;
the drawn line shows the whole mix decision for the whole song at a glance.

The mixer sits between stem export and mastering in the suite's pipeline:

```
stems  →  track_mixer  →  stereo mixdown (WAV)  →  mix-mastering  →  player
```

## Goals

- Mix stems by drawing level lines, mute regions and fades — no faders.
- Very easy UI: few controls, everything visual, hotkey-driven like player_editor.
- Non-destructive: the mix is a small JSON document referencing the audio files.
- Export a stereo mixdown entirely in the browser (no server).
- Integrate with Mazy Suite conventions (`data/` folder, album/song metadata,
  lyric timing markers from player_editor).

## Non-Goals

- Recording, time-shifting/arranging clips, MIDI, plugins.
- Mastering (loudness, limiting, multiband) — that is `mix-mastering`'s job.
- Live mixing / performance use.

## Core Concepts

### Song project

A song project is a folder of stems plus one mix document:

```
data/stems/<album>/<song>/
  drums.mp3
  bass.mp3
  vocals.mp3
  ...
  mix.json        ← the mix document (see Data Format)
```

Stems can also be loaded ad hoc from local files (like player_editor's
open-files flow) for songs not yet in the suite's data tree.

### One gain envelope per track (internal model)

Internally, **everything that affects a track's level is a single gain curve**:

- The drawn level line contributes breakpoints.
- A *mute region* is a segment of that curve at zero, with short ramps at the
  edges.
- A *fade-in/out* is just the shape and length of a ramp.

The UI presents these as three distinct, simple gestures (draw a line, drag a
region, add a fade) but the audio engine only ever evaluates one curve per
track. This keeps the engine trivial (`GainNode` + `setValueCurveAtTime`) and
makes undo/redo and serialization simple.

### Micro-fades

Every hard edge (region boundary without an explicit fade) automatically gets a
short default ramp (~15 ms) so cuts never click. Users never think about it.

## User Interface

### Layout

Vertically stacked lanes, one per track, sharing one time axis:

```
[ transport: play/pause · time · A/B bypass · export ]
[ ruler / markers (lyric lines, song sections) ......................... ]
[ drums   | S M eq ] [ waveform + drawn level line + mute regions ...... ]
[ bass    | S M eq ] [ waveform + drawn level line ..................... ]
[ vocals  | S M eq ] [ waveform + drawn level line ..................... ]
[ GROUP: rhythm    ] [ level line only (applies to member tracks) ...... ]
[ MASTER  |  meter ] [ level line only ................................. ]
```

Track headers are minimal: track name, Solo, Mute, group color dot, and the
3-band EQ (three small vertical sliders — the one place where a fader-like
control *is* the simplest thing).

### Level line (envelope)

- A horizontal line drawn over the waveform; y position = gain (0..1).
- **Click on the line** to add a breakpoint, **drag** points to move them,
  **right-click / double-click** a point to delete it.
- The line between points is linear; before the first / after the last point
  the value holds flat.
- The *effective* gain (envelope × regions × fades) is what's drawn, so fades
  and region dips are always visible in the line itself.

### Mute regions

- **Shift+drag** (or a dedicated mode/hotkey, cf. player_editor's Insert) on a
  track creates a mute region — a shaded rectangle.
- Click a region to select it; drag its edges to resize; Delete removes it.
- Region edges always fade (micro-fade minimum); a selected region exposes the
  fade option.

### Fades

Fades are chosen from presets, not numbers, matching the "very easy" goal:

| Preset | Length | Shape           |
|--------|--------|-----------------|
| Fast   | 50 ms  | linear          |
| Medium | 0.5 s  | smooth (S-curve)|
| Slow   | 2 s    | logarithmic     |

Applied to region edges (keys 1/2/3 on the selected region) and to the song's
start/end via fade handles on each track, like WaveSurfer's envelope plugin.

### Group tracks (VCA-style)

A *group lane* has no audio — only a level line. Its curve **multiplies** the
curves of its member tracks (e.g. a "rhythm" group over drums + bass + perc).
Membership is shown as a color dot on the track headers. Groups keep the lane
count low for songs with many stems: collapse members, keep the group line.

### Master

The master lane has a level line (drawn like any other), and next to it the one
piece of traditional metering worth keeping: a level meter with a **clip
indicator**, since drawn envelopes can silently sum into clipping. Optionally a
master 3-band EQ.

### Pan (optional, phase 2)

A second drawable line per track (different color, waveform center = center) —
the same gesture the user already knows, hidden behind a toggle to keep the
default view clean.

### 3-band EQ

Per track: low shelf (~200 Hz), peaking mid (~1 kHz), high shelf (~4 kHz),
each ±12 dB. Three small vertical sliders in the track header; double-click a
slider to reset to 0.

### A/B bypass

One toggle (hotkey `B`) that plays the raw stems flat — the fastest way to
judge whether the mix is helping. Solo/Mute stay respected.

### Markers from the suite

If the song has lyric timings (SRT from player_editor) or section markers, show
them on the ruler and **snap** region edges and breakpoints to them ("mute the
guitar until verse 2 starts").

## Hotkeys

Same spirit and, where meaningful, same keys as player_editor:

| Key            | Action                                    |
|----------------|-------------------------------------------|
| Space          | Play / pause                              |
| B              | A/B bypass mix                            |
| S / M          | Solo / mute hovered or selected track     |
| Shift+drag     | Create mute region                        |
| 1 / 2 / 3      | Fade preset on selected region            |
| Delete, Esc    | Remove / deselect region                  |
| Home           | Playback to start                         |
| ← / →          | Nudge selected point / region             |
| Ctrl+S         | Save mix document                         |
| Ctrl+O         | Open stems                                |
| Ctrl+Z / Y     | Undo / redo                               |

## Audio Engine

Web Audio API, one graph per playback:

```
source(stem) → GainNode(track curve) → 3×BiquadFilter(EQ) → [StereoPanner] →
   GainNode(group curve) → GainNode(master curve) → AnalyserNode(meter) → destination
```

- Track/group/master curves are sampled from the envelope model (~200 Hz) into
  `Float32Array`s and applied with `setValueCurveAtTime` — no per-event
  scheduling logic.
- Whole stems are decoded into memory (`AudioBuffer`), as player_editor already
  does since "Load whole audio data in memory".
- Editing during playback: rebuild curves and restart sources at the current
  position (cheap, and the sketch proves it feels seamless enough).
- **Export**: render the identical graph in an `OfflineAudioContext`, encode
  16-bit stereo WAV in the browser, download. The WAV is the input for
  `mix-mastering`.

## Data Format — the mix document

`mix.json`, non-destructive, references audio by relative path. Envelope points
are `[time, gain]`; regions carry their own fades.

```json
{
  "version": 1,
  "song": { "album": "alternative-dives", "title": "Track 03" },
  "stems": [
    { "id": "drums",  "file": "drums.mp3",  "group": "rhythm" },
    { "id": "bass",   "file": "bass.mp3",   "group": "rhythm" },
    { "id": "vocals", "file": "vocals.mp3" }
  ],
  "tracks": {
    "drums": {
      "envelope": [[0, 1.0], [152.5, 1.0], [158.0, 0.6]],
      "regions": [{ "start": 34.2, "end": 41.0, "fade": 0.5, "shape": "smooth" }],
      "eq": { "low": 0, "mid": -2, "high": 1.5 },
      "pan": [[0, 0]],
      "mute": false
    }
  },
  "groups": { "rhythm": { "envelope": [[0, 1.0]] } },
  "master": { "envelope": [[0, 1.0]], "eq": { "low": 0, "mid": 0, "high": 0 } },
  "markers": { "source": "Even the Past.srt" }
}
```

## Suite Integration

- **Data conventions**: stems and `mix.json` live under the suite `data/` tree,
  next to the existing per-album `.json` / `.md` / cover files; album metadata
  comes from `albums.json` / the metadata cache.
- **player_editor**: reuse the SRT parser for lyric markers; same hotkey
  philosophy; same load-in-memory audio approach.
- **mix-mastering**: the exported WAV is its input; a "Send to mastering"
  action can be added later.
- **player**: eventually list mixed songs like any other track.

## Tech Stack (recommendation)

- Vite + React (like player_editor), pnpm.
- State: Recoil for consistency with player_editor, or zustand if starting fresh.
- Waveform rendering: **two candidate approaches**, to be decided in M1:
  1. WaveSurfer.js v7 with the official **Envelope** and **Regions** plugins —
     the Envelope plugin already implements the drawn-line-with-fade-handles
     interaction; player_editor proves the library in the suite.
  2. Custom `<canvas>` rendering — the sketch (`sketch/index.html`) proves this
     is small and fully controllable (one code path draws waveform + effective
     gain line + regions), at the cost of owning the code.
- Audio: plain Web Audio API in an `AudioEngine` class (as in player_editor's
  `Waveform.js`).

## Milestones

- **M1 — Core interaction** (the sketch, productized): stacked lanes, level
  line editing, mute regions with micro-fades, solo/mute, play/seek, bypass.
- **M2 — Persistence & export**: mix document load/save, WAV export, undo/redo.
- **M3 — Groups & EQ**: group lanes, 3-band EQ, master meter + clip indicator.
- **M4 — Suite integration**: stems from `data/`, lyric/section markers,
  snapping, send-to-mastering.
- **M5 — Polish**: pan line, fade shapes, keyboard nudging, zoom.

## Sketch

`sketch/index.html` is a self-contained, dependency-free prototype of M1 —
open it directly in a browser (no server, no build). It synthesizes three demo
stems (drums / bass / pad) so it works with zero setup, and each track can also
load a local audio file. It implements: drawn level lines, shift+drag mute
regions with fade presets, solo/mute, A/B bypass, seek, editing during
playback, and WAV export. Its purpose is to validate the *feel* of the core
gesture before committing to the full stack.
