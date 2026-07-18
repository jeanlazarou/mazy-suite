# Groove Lab

A drum + bass line composition tool for musicians who aren't drummers or bassists.
Compose piece by piece: generate a groove for a section, fix it by hand on a grid,
chain sections into a song, and export to MIDI.

Frontend-only — React + Vite + TypeScript, audio via Tone.js (synthesized kit,
nothing to download). Runs entirely in the browser.

## Getting started

```bash
pnpm install
pnpm dev        # → http://localhost:5173
```

The app opens with a basic rock groove so there's something to press Play on.

## Using the drum grid

Rows are drums (kick at the bottom, cymbals at the top), columns are sixteenth
notes. Numbers in the header mark the beats.

| Action | How |
|--------|-----|
| Add / remove a hit | Click a cell |
| Paint several hits | Click and drag across cells |
| Accent a hit | Right-click a lit cell — cycles normal → accent → ghost (brightness shows the level) |
| Hear a drum on its own | Click the lane name |

Edits apply while the pattern is playing — no need to stop.

The drum and bass grids share one timeline: scrolling one scrolls the other,
and during playback the view follows the playhead when it runs past the
right edge.

## Using the bass roll

Rows are pitches (a 4-string bass range, E1 up to G3; unlabeled rows are the
sharps), columns are the same sixteenth notes as the drum grid.

| Action | How |
|--------|-----|
| Add a note | Press on an empty cell and drag right to set its length |
| Delete a note | Click it |
| Accent a note | Right-click it — cycles normal → accent → ghost |
| Hear a pitch | Click its row label |

The bass line is monophonic (like the synth that plays it): placing a note over
an existing one replaces it, and a long note that rings into a new one gets cut
short at the new note's start.

The **roll / tab** toggle in the Bass header switches to bass tablature —
four string lines (G, D, A, E) with the same step columns as the drum grid:

| Action | How |
|--------|-----|
| Place a note | Click a cell — an open-string note appears, then type the fret number (two digits work: 1 then 2 → 12) |
| Change pitch | Type a new fret, or ↑ / ↓ for semitones (stays on the string while it can) |
| Move around | ← / → move the cursor along the string |
| Delete | Right-click, or Backspace at the cursor |

Notes remember which string you put them on. The note length selector below
sets the length of newly placed notes.

## Drum kits

The **Kit** selector in the transport picks the drum sound: **synth**
(the default — instant, offline, zero assets) or sampled kits (**acoustic**,
**CR78**, **Kit8**) that stream from the Tone.js sample library on first
play and are cached by the browser. Open hat, crash and ride aren't in the
sample sets and stay synthesized; if a sample hasn't loaded yet (or you're
offline), that lane falls back to the synth so playback never goes silent.

Each grid header also has a **Humanize** button that spreads velocities a
little (±0.08) so the groove sounds less machine-perfect. Click it again for
a different spread; Undo reverts.

## Song library

The **Song** bar names the current song and browses your saved works — all
kept in the browser's localStorage:

- The name field renames the current song (blank falls back to "Untitled").
- The dropdown lists every saved song, most recently touched first; picking
  one saves the current song and opens the other.
- **+ New** starts a fresh song (the current one stays in the library);
  **Delete** removes the current one after confirmation.

Everything autosaves as you edit. A save from before the library existed is
migrated in automatically as "My first groove". Undo history doesn't cross
songs — switching clears it.

## Sections and arrangement

A song is a set of **sections** (A, B, C…), each with its own pattern, plus an
**arrangement** — the play order (A A B A…). The bar under the transport
manages both:

- Click a section chip to edit it; **+ New** adds a section starting from a
  copy of the current one; **×** deletes a section (and its arrangement
  entries).
- **+ A** appends the current section to the arrangement; clicking an
  arrangement chip removes that occurrence. Editing a section changes every
  occurrence.
- **▶ Section** loops what you're editing; **▶ Song** plays the arrangement
  in order (looped), highlighting the chip that's sounding. Each section
  plays at its own BPM and swing.
- **⬇ Section** / **⬇ Song** export one section or the whole arrangement
  (with tempo changes at section boundaries) as MIDI.

**Undo** (Ctrl/Cmd-Z, up to 20 steps) reverts any edit — including a
generator overwriting your groove.

## Generators

Each section header has its own generator controls. Generation **replaces**
what's in the grid — Undo brings the old groove back if you regret it.

**Drums**
- Pick a style (rock, funk, disco, shuffle) and hit **Generate**. Some hits
  are probabilistic, so clicking again gives a variation of the same style.
  Shuffle also sets the swing slider to 65%.
- **Fill** replaces the last 4 or 8 sixteenths with a snare→toms run that
  builds in volume (hats drop out — that's part of the effect).
- **Euclid** spreads N hits per bar as evenly as possible across the chosen
  lane (the classic Euclidean rhythms; N is effectively a density knob).
  Try 7 on the closed hat or 3 on the kick.

**Bass**
- Pick a root note and a flavour, then **Generate**: the line locks onto the
  kick rhythm (or quarter notes if there's no kick). *roots* plays the root
  every time, *root–fifth* alternates, *walking* wanders a root-heavy
  pentatonic.

## AI generation (local Ollama)

The **AI** bar asks a local Ollama model to transform the current section:
pick a model, pick a preset ("Busier hi-hats", "Make a variation…", fill,
bass-from-kick) or type your own instruction, hit **Generate**. The result
replaces the section's pattern — Undo brings the old one back.

- Ollama must allow the dev origin:
  `OLLAMA_ORIGINS=http://localhost:5173 ollama serve`
  (the AI bar tells you when it can't reach it). A different Ollama URL can
  be set with `VITE_OLLAMA_URL`.
- The model output is JSON constrained by a schema, then sanitized — steps
  clamped to the grid, velocities normalized (even 0–127 confusion), bass
  pitches folded into range, monophony enforced. Tempo, bars and swing are
  never the model's to change.
- **Model choice matters**: qwen2.5 (7b and up) gives real variations in a
  few seconds; tiny models like llama3.2 3b tend to echo the pattern back
  unchanged.

## Transport controls

- **Play / Stop** — loops the pattern; the highlighted column is the playhead.
- **BPM** — 40–240, changes take effect live. Invalid entries snap back.
- **Bars** — 1, 2, or 4. Shrinking drops hits that no longer fit.
- **Swing** — 0% straight, 100% full triplet shuffle on the off-beat sixteenths.
- **Export MIDI** — downloads the pattern as a `.mid` file (named after the
  BPM). Drums land on channel 10 with General MIDI percussion numbers, bass on
  its own track (GM fingered bass), and swing is baked into the note timing —
  a DAW plays back exactly what you heard.

Each section has its own **Clear** button next to its heading.

## Development

```bash
pnpm test       # unit tests (vitest)
pnpm build      # typecheck + production build
```

The pattern JSON (`src/types.ts`) is the single source of truth — editor,
playback, and (soon) MIDI export are all pure functions of it. See
[CLAUDE.md](CLAUDE.md) for the full design decisions and
[MIDI_EXPORT_NOTES.md](MIDI_EXPORT_NOTES.md) for the field notes behind them.

## Roadmap

1. ~~Drum grid editor + synth playback~~ ✅
2. ~~Bass piano roll + playback~~ ✅
3. ~~MIDI export~~ ✅
4. ~~Algorithmic generators~~ ✅
5. ~~Sections / arrangement + persistence~~ ✅
6. ~~LLM-generated variations via local Ollama~~ ✅
7. ~~Polish — bass tab entry, humanize, drum samples~~ ✅

The planned build order is complete. Ideas beyond it: reorderable
arrangement chips, per-section names, timing humanize (needs offsets in the
data model), MIDI import.
