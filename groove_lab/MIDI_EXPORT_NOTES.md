# MIDI Export — Field Notes

Lessons learned building the MIDI generation/export feature of Harmonic Composer
(Python 3.14, **music21 10.3**, FastAPI backend; Tone.js playback in the browser).
Written as a checklist for the next project that needs "export to MIDI".
Every item below was a real bug or design lesson, not theory.

---

## 1. music21 → MIDI gotchas (v10.x)

These are the exact failure modes we hit. Most raise deep inside
`music21.midi.translate` at *write time*, long after parsing appeared to succeed.

### `score.write("midi", fp=…)` requires a real file path
`BytesIO` fails with `TypeError: expected str, bytes or os.PathLike`. Write to a
`tempfile.mkstemp()` path, read the bytes back, unlink. There is no in-memory
MIDI export path worth relying on.

```python
fd, path = tempfile.mkstemp(suffix=".mid")
os.close(fd)
try:
    score.write("midi", fp=path)
    with open(path, "rb") as f:
        return f.read()
finally:
    os.unlink(path)
```

### The ABC parser returns a flat Part — no Measure containers
For simple single-line tunes, `converter.parse(abc, format="abc")` gives a Part
whose notes sit directly at part level. MIDI export then dies in
`expandRepeats` with *"cannot process repeats on Stream that does not contain
measures"*. Fix: `if not part.hasMeasures(): part = part.makeMeasures()`.

### One TimeSignature object reused at many offsets
For multi-line ABC (and ABC with repeated header fields), the parser emits the
**same `TimeSignature` object** placed in several measures. Export fails with
*"the object <TimeSignature 4/4> is already found in this Stream"*. Parsing is
fine; only export breaks — and the placements exist **both at Part level and
inside Measures**, so a cleanup must sweep both. Keep the first occurrence and
genuine meter *changes*; drop value-identical repeats (or replace them with
`copy.deepcopy`).

### `ChordSymbol.realize()` no longer exists
Removed in music21 10.x. Constructing `harmony.ChordSymbol(token)` is the
validation and produces `.pitches` directly.

### `ChordSymbol` parsing is strict and case-sensitive
`harmony.CHORD_TYPES` defines the accepted abbreviations. Traps:
- Flat roots must be `B-`, not `Bb` — a leading `Xb` root misparses as part of
  the quality abbreviation (`Bbmaj7` → "invalid abbreviation 'bmaj7'").
- `maj7` is valid but `Maj7` is not; `Maj9` is valid but `maj9` is not.
  Check `CHORD_TYPES` per abbreviation rather than assuming consistency.
- No parentheses (`Fmaj7(#11)`), no comma-separated alterations (`G13(b9,#11)`),
  no jazz shorthand `alt` — all must be normalized first (`Fmaj7#11`,
  `G13b9#11`, `G7#5#9`).

### Sharp/flat enharmonics
Pick one convention early (we normalized all sharp roots to flats — jazz
convention) or every comparison and lookup grows special cases.

---

## 2. If the notes come from an LLM

The single biggest source of broken MIDI was upstream notation, not the export
code. Models produce, constantly:

- **Scientific pitch notation instead of ABC**: `D4 B3 Bb4 C5` (letter+octave)
  where ABC expects letters with duration multipliers. The telltale that makes
  detection reliable: **an accidental between letter and digit (`Bb4`, `F#5`)
  is impossible in valid ABC.** We auto-convert when detected (octave → ABC
  case/comma/apostrophe, `b`→`_`, `#`→`^`), losing rhythm (default durations)
  but salvaging playability.
- **Header fields repeated inside the body** — each generated section carries
  its own `M:/L:/K:` block. Combined with the shared-TimeSignature bug above,
  this alone kills export. Strip or dedupe identical field lines textually
  *and* clean the parsed stream.
- **Code fences, prose lines** (`Here is the melody:`) mixed into notation.
  Dangerous because music21's ABC parser is *lenient*: prose letters A–G parse
  as phantom notes — silent corruption, not an error.
- **Chord notation dialects**: parens, `alt`, `M9` vs `Maj9` vs `maj9`, two
  chords per bar separated by a space. Decide whether split bars are supported
  end-to-end (duration split, display) or forbidden in the prompt — half-support
  is worse than either.
- Prompt-level guidance (explicit format spec + one inline example, "NEVER
  scientific pitch like 'C5'") reduces occurrence a lot but never to zero.
  **You need both the prompt fix and the sanitizer.**

---

## 3. API / architecture lessons

- **Never silently swallow render failures.** Our `build_midi_bytes` returned
  `None` on any exception so the API could respond without MIDI — reasonable —
  but with no logging, "the play button is missing" took a debugging session to
  trace. Log at WARNING with the traceback and a snippet of the input.
- **Serve MIDI as base64 in the JSON response** (`base64.b64encode(midi).decode()`).
  Frontend decodes with `Uint8Array.from(atob(b64), c => c.charCodeAt(0))` for
  both playback and `Blob`-based download. Simple, cacheable with the result,
  no second round trip.
- **Store the *inputs* (notation + chords + bpm) alongside the rendered MIDI**
  wherever results are persisted. When a rendering bug is fixed later, old
  results can be re-rendered. We added a dedicated `POST /midi` endpoint
  (re-render from stored notation, no LLM involved) plus a "repair" UI over
  localStorage — only possible because the inputs were saved.
- **Rendering is a pure function — expose it separately** from generation.
  `(melody, chords, bpm) → bytes | None` with no model calls is instant, easy
  to test, and reusable (repair, preview, export variants).
- MIDI bytes for short pieces are small (hundreds of bytes to a few KB base64)
  — fine for localStorage/JSON. Don't build blob storage until proven necessary.

---

## 4. Browser playback (if needed)

- **Tone.js `Sampler`** + Salamander Grand Piano samples from
  `https://tonejs.github.io/audio/salamander/` sounds far better than
  oscillator synths and needs no local soundfont. Samples stream on first play
  (~seconds) — show a "loading piano" state; the browser caches afterwards.
- **`@tonejs/midi`** parses the MIDI bytes into note events; schedule with
  `Tone.Part` against the Transport. Set `Transport.bpm` explicitly — the MIDI
  file's tempo meta event is *not* applied automatically by this path.
- Keying the player component on which take/variant is selected avoids stale
  scheduled events when switching A/B sources.

---

## 5. Testing

- **Pin every fixed failure as a test with the real offending data.** Our suite
  keeps the exact LLM outputs that broke export (multi-header melody, scientific
  notation, split bars, every chord-dialect token). Synthetic "looks valid"
  fixtures would have caught none of them.
- Test the *contract*, not just success: "unrenderable input returns `None`,
  never raises" is a test.
- If validation rules gate the output (we checked voice-leading), make sure the
  **reference/training data itself passes** — ours didn't, three times, and each
  time the rule was wrong, not the data.

---

## Quick-start skeleton

The battle-tested core is ~60 lines: see `backend/harmonic_composer/playback.py`
in this repo (`build_midi_bytes`, `_dedupe_field_lines`,
`_strip_redundant_time_signatures`) and its regression suite in
`backend/tests/test_playback.py`. Copy those two files as the starting point.
