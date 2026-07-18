# groove_lab — CLAUDE.md

## What this project is

A drum + bass line composition tool for a musician who is **not a drummer or bassist**.
The user composes piece by piece: generate a groove for a section, then fix it by hand
(move/add/remove drum hits on a grid, edit bass notes), chain sections into a song,
and export to MIDI.

**Status (2026-07-05): the full build order (items 1–7) is done** — editors
(grid, piano roll, bass tab entry — replaced the planned "neck" view at the
user's request; tab reads better against the step grid), synth + sampled
kits, MIDI export
(section & song), generators, sections/arrangement, autosave + undo, Ollama
JSON generation, humanize. `README.md` is the user guide;
`.claude/skills/verify/SKILL.md` documents how to drive the UI headlessly.
LLM quality note: qwen2.5 7b+ works well; llama3.2 3b echoes patterns back
unchanged. Sampled kits stream from tonejs.github.io (synth fallback keeps
playback working offline).

## Decisions already made (don't re-ask)

| Decision | Choice | Reason |
|----------|--------|--------|
| Name / location | `groove_lab` in `mazy_suite/` | User picked it |
| Architecture | **Frontend-only** — React + Vite + TypeScript, pnpm | No backend to run; MIDI export works in-browser; user knows this stack from a previous project |
| Generation | **Hybrid**: algorithmic first, LLM (Ollama) on top later | Algorithmic is instant/offline/controllable; LLM adds "busier hats"-style variations. See build order |
| LLM output format | **JSON constrained by a schema** (Ollama supports this), never music notation | A previous project (dspy_music) lost weeks to sanitizing LLM notation output — see MIDI_EXPORT_NOTES.md §2. JSON grids make that whole bug class impossible |
| MIDI export | `@tonejs/midi` (it *writes* MIDI, not just parses), in-browser Blob download | Avoids Python/music21 entirely — see MIDI_EXPORT_NOTES.md §1 for what that avoids |
| Playback | Tone.js; **synthesized kit first** (MembraneSynth kick, NoiseSynth snare/hats, MonoSynth bass), samples later | Zero assets to load on day one |
| Package manager | pnpm | User preference |
| LLM backend | Ollama, local (user runs llama3.2, mistral, qwen2.5, phi4); model selectable at runtime | Privacy, no API keys — same as user's previous projects. Browser calls Ollama's HTTP API directly; Ollama must be started with `OLLAMA_ORIGINS` allowing the dev origin (e.g. `OLLAMA_ORIGINS=http://localhost:5173 ollama serve`) |

## Core design: the pattern JSON is the single source of truth

Everything — editor, playback, MIDI export, generators (algorithmic and LLM) — is a
pure function of / mutation on this structure. This is the central lesson carried over
from the previous project (MIDI_EXPORT_NOTES.md §3: store inputs, rendering is pure).

```ts
interface Pattern {
  bpm: number;
  bars: number;
  stepsPerBar: number;             // 16 = sixteenth-note grid
  swing: number;                   // 0–1
  drums: Record<DrumLane, Step[]>; // lanes: kick, snare, hhClosed, hhOpen, tom1…; Step = {step, velocity}
  bass: BassNote[];                // {step, durationSteps, midiPitch, velocity}
}
```

A **song** is an ordered list of sections (A A B A…), each owning one Pattern.
Generate/edit per section; playback chains them; export the whole song or one section.

## UI

- **Drum editor:** classic step-sequencer grid — lanes × steps, click to toggle a hit,
  drag or second interaction for velocity/accent.
- **Bass editor:** piano-roll grid (rows = pitches, notes have length).
  The user's own idea, saved for later polish: a **"bass neck" entry view** — click a
  step, then pick the pitch on a rendered 4-string bass neck. Nice enhancement, not v1;
  time still needs a horizontal grid either way.

## MIDI export details

- Drums on MIDI **channel 10** (index 9) using General MIDI percussion numbers:
  kick 36, snare 38, closed hat 42, open hat 46, low tom 45, mid tom 47, high tom 50,
  crash 49, ride 51. Bass on its own track/channel (GM program 33/34).
- Export = pure function `(song | pattern) → midi bytes` → Blob download.
- Persist pattern JSON (localStorage history like the previous project, ~20 entries),
  never only the rendered MIDI — patterns can always be re-exported after a fix.

## Generation

**Phase 1 — algorithmic (build first):**
- Style templates: rock, funk, disco, shuffle, … as seed patterns
- Euclidean rhythm generator, per-lane density/probability knobs
- Fill generator for last bar of a section
- Bass: lock rhythm to the kick pattern; pitches from a chosen key/root (roots,
  root–fifth, walking-ish options)

**Phase 2 — LLM (after the editor + export work):**
- Ollama `/api/chat` with `format` set to the Pattern JSON schema
- Use cases: "variation of this pattern", "busier hats", "fill here",
  "bass line that follows this kick"
- Model selector fetches `GET /api/tags` from Ollama; keep tags like `qwen2.5:32b`
  distinct, strip only `:latest`

## Build order

1. **Scaffold + drum grid editor + Tone.js playback (synth kit)** ← START HERE.
   Deliverable: a playable drum grid the user can react to.
2. Bass piano roll + playback
3. MIDI export (do it early — it's the stated goal and it pins the data model)
4. Algorithmic generators
5. Sections/arrangement + localStorage persistence
6. Ollama JSON generation for variations/fills
7. Polish: bass-neck entry view, swing, humanize/velocity spread, drum samples

## Testing

Pin every fixed bug as a test with the real offending data (MIDI_EXPORT_NOTES.md §5).
Export contract test from day one: "unrenderable pattern returns null/never throws".

## Reference

`MIDI_EXPORT_NOTES.md` (repo root) — battle-tested field notes on MIDI export, LLM
output pitfalls, Tone.js playback, and testing, from the previous project
(`mazy_suite/dspy_music`, a throwaway experiment; don't build dependencies on it).
