# Twin Diff

## Project Overview

A browser-based **side-by-side diff viewer for two recordings of the same
song** — the way a text diff shows two versions of a file. Two songs, two
vertical waveforms, time flowing downward, with the parts that stayed the
same, the parts that were reworked, and the parts that were added or dropped
marked and linked across the middle.

It was born from a concrete case: songs recorded years ago, fed to **Suno**
(an AI audio studio) and given back reworked. Listening to both and trying to
say *what actually changed* means scrubbing back and forth in two players.
Twin Diff puts them side by side instead.

Nothing in the tool is specific to that case. Any two audio files can be
twinned: a 2009 demo against a 2019 re-recording, a mix against its master, a
studio take against the live version. (A playback/vocals stem pair also loads,
though that is a side use — see *Both sides audible*.)

```
   two recordings  →  twin_diff  →  a twin document (JSON) you can reload
                                     and share, describing what changed
```

## Goals

- Show two songs at once, vertically, with lyrics and the parts that differ.
- Let the user **define** the differing parts by ear and by hand — the tool
  claims no knowledge the user did not give it.
- Seed that work from the two SRT files when they exist, so the common case
  starts from a real first-pass diff instead of an empty page.
- Play either side while both scroll together, so a comparison is one keypress.
- Save the result as a small JSON document referencing the audio files, and
  reload it.
- Stay a Mazy Suite citizen: suite `data/` tree, album JSON, SRT lyrics, the
  suite bridge, player_editor's hotkey spirit.

## Non-Goals

- Editing audio. Twin Diff never writes a sound file; it only describes.
- Time-stretching either side to make them match. It maps time, never resamples.
- Deciding which version is better, or scoring similarity.
- Automatic audio alignment (DTW on chroma features) in the first versions —
  see *Milestones*, phase 3.

## Core Concepts

### The twin — sides A and B

A **twin** is two sides, `a` and `b`, each one audio file plus optionally an
SRT lyrics file, a label ("2009 demo", "Suno rework") and an `ai` flag. A is
drawn on the left, B on the right, and the roles never swap silently — the
whole point is that you know which one you are hearing.

### Time is what we know before anything else — and only that

Knowing nothing about two recordings, one thing still holds: both start at 0
and both last a while. That is the whole of the *a priori* information, and it
is where a session begins — two songs laid out head to head on a shared clock,
which is honest precisely because it claims nothing.

It is also the ceiling of what a shared clock can say, and the ceiling is low.
Two recordings of the same song drift: a re-recording is a few BPM off, an AI
rework hands back a chorus four seconds longer, an added bridge pushes
everything after it down. Under one axis, a song identical from the second
verse on reads as "different everywhere after 0:45" — the useless answer a
text diff exists to avoid. A text diff does not put line 40 of the old file
next to line 40 of the new one; it puts *corresponding* lines together and lets
the line numbers disagree. Here the line numbers are seconds.

So every piece of information the user adds is a correspondence, and the layout
follows the correspondences rather than the clock:

> **Each side keeps its own time axis. The document is a list of
> correspondences between a range of A and a range of B. The clock is the
> default assumption; a correspondence is knowledge, and it wins.**

Both ends of that are the same model, which is what keeps the tool coherent:
with nothing defined, the document holds a single implicit pair covering both
songs whole, both sides stretched to the same height — the shared clock, as a
one-segment twin. Every segment the user marks replaces a guess with something
known, and nothing else in the tool needs to care which is which.

### Segments — the diff hunks

A **segment** is one pair of ranges, and it is the only unit in the document:

| `kind`    | `a`        | `b`        | Means                                          |
|-----------|------------|------------|------------------------------------------------|
| `same`    | a range    | a range    | same music, same place, nothing worth noting   |
| `changed` | a range    | a range    | same passage, reworked (the interesting one)   |
| `added`   | `null`     | a range    | only in B — an added bridge, a new outro       |
| `removed` | a range    | `null`     | only in A — the guitar solo they dropped       |
| `unknown` | (implicit) | (implicit) | material the user has not classified yet       |

`same` and `changed` both mean "these two stretches correspond"; they differ
only in what the user wants to see highlighted. Nothing in two different
recordings is ever *identical*, so `same` is to be read as "not worth your
attention", which is the same thing a text diff's unchanged lines mean once a
file has been reformatted.

Invariants, checked on load and maintained by the editor:

- segments are ordered; on each side the ranges are non-overlapping and
  increasing;
- a segment names at least one side;
- coverage is **not** required. Whatever is left between two segments is an
  implicit `unknown` pair of the two leftovers, rendered neutrally. An empty
  segment list is therefore a valid document: one `unknown` pair, both songs
  whole. That is the "no diff info yet" state, and it is the state every
  session starts in.

### Lyrics are the anchors

If a side has an SRT file, its cues are drawn next to its waveform, and they
are also anchors for authoring: the magnet sticks an edge to where a sung line
starts or ends, so marking "from this line to that one" lands on the lines
without touching a millisecond value. Timing the two songs in
**player_editor** first is therefore the cheapest way to prepare a twin — and
those SRT files are probably already there. (Pairing by clicking one cue on
each side is not built: Shift+click with the magnet on already lands on the
line, which covered the need.)

### Seeding the diff from the lyrics

When *both* sides have an SRT, Twin Diff can propose segments before the user
marks anything (`g`, or *seed from lyrics*).

The words are not preserved, and that shapes everything. The rework was made by
uploading the recording with *no lyrics provided*: the AI transcribed what it
thought it heard, got some of it wrong, and sang the substitutes over an
unchanged melody. So an exact line diff would call half the song
`added`/`removed` when the music never moved.

**Words are aligned, not lines.** The first design paired cue with cue on a
similarity threshold. On the first real pair it was tried on, it paired 17 of
39 and 32 cues, for two reasons: two independent transcripts never cut a song
into cues the same way (the demo's "running so fast to unknown direction now"
is one line of the original, and "running so fast" / "to a known direction"
two of the rework), and a short misheard line ("a train in my mind now" /
"I turn on my mind now") falls under any threshold that still means
something. So the whole song's words are
aligned as one sequence (longest common subsequence, each word timed by its
position inside its cue), and read the way a text diff reads a hunk: where both
sides differ between the same anchors, that is a *replacement* — `changed`, not
a removal next to an addition. A shared word or two squeezed between two
differences ("my", "now") is a coincidence, not an anchor, and is folded into
the change.

Plain LCS needed one correction, found on the demo. The original sings its
last verse twice, the no-lyrics rework once — and the rework's misheard "try
and run time place / try and hang on time" shares "time" with the original's
first copy and "on time" with its second. Counting words and nothing else,
pairing across both copies wins by one word, and the proposed correspondence
reached across the whole song. So a match is weighed by how lopsided the skip
that reached it was: about as many words skipped on both sides is a change and
costs nothing; many sung words skipped on one side only (more than 8) costs,
up to more than the few words it could gain. A break one side merely
stretched skips no words and costs nothing, so a rework's longer instrumental
still pairs its verses correctly.

**Segments are sections, not words or lines.** The alignment is cut wherever
either side falls silent for 8 s or more — the gaps between sections, not
between lines — and each section becomes one segment: `same` if every word
agrees, `changed` if any differs, `removed`/`added` if only one side sings
there. What happens inside a long silence is left unclassified: an
instrumental break, stretched or not, is for the ear to judge, and the ribbons
show its length. On that first pair this gave four segments — two
verse-and-chorus sections, the last chorus after a break the rework stretched
from 16 s to 44 s, and a tag only the recording has — instead of the 37 a
word-level cut produced.

Seeding **never overrides** the document: every segment already marked stays,
and a proposal is added only where it contradicts nothing — no overlap, and on
the same side of every existing segment on both timelines. What the user marked
is knowledge; the lyrics are a guess. It is one undo step.

The detail lives in the lyrics themselves. Beside each waveform the sung lines
are drawn at the moment they are sung, and the words one side sings and the
other does not are highlighted — a **word-level inline diff**, the way a text
diff highlights the changed words within a changed line:

```
 A   a train in my mind now            B   I turn on my mind now
     ^^^^^^^^^^                             ^^^^^^^^^
```

For the original use — showing a friend what the AI did to songs you recorded
together — this is probably the most quotable thing on the screen, and it comes
out of data that is already there.

**Where side B's SRT must come from.** It has to be a *transcription* of B, not
A's lyrics force-aligned onto B's audio. srt_generator does both: its preferred
path takes a lyrics file and aligns it, the fallback runs whisper with no
lyrics ("rough words, draft timings"). For a twin, the fallback is the correct
path for the reworked side — aligning A's words onto B's audio would quietly
write A's words into B's SRT and hide precisely the substitutions worth seeing.
Rough words are fine here, and the user fixes what matters in player_editor.

**Side A needs the real words, not a second transcription.** Whisper mishears
the original too — on the first pair it misheard a line of the original as
badly as the AI had. Two raw transcripts compared word by word show where the
*transcriber* disagrees with itself, not what the rework changed. So the
original's SRT carries the lyrics as written — aligned from a lyrics file, or
corrected onto a transcript's timings — while the rework's stays exactly as
transcribed, unless someone has written down what the rework actually sings:
those are its own words, and aligning them imposes nothing.

The proposal is always editable and always discardable — it is a starting
point, never a verdict.

### The AI flag

`ai` is a boolean on each side of the twin document, default `false`, meaning
"this rendition was machine-generated". It earns its place, but cheaply: a
small `⟨AI⟩` badge in the side header, and nothing more. Not a different kind of
display, and not a waveform tint either — a rework you need to compare bar by
bar is not helped by being drawn differently, and the layout's job is symmetry.

It stays in the twin document and does not spread to the suite's album format.
"This is the AI rendition" is a statement about a comparison, not a property of
a file: it is meaningful next to the recording it reworks, and no other tool in
the suite would read it. A flag in `<album>.json` would be a field five apps
carry and none use. If the player ever wants to label such a track, the twin
document is where it can read it from.

## User Interface

### Layout

Two vertical strips, time flowing **downward**, amplitude spreading sideways
from each side's inner edge, with ribbons across the gutter between them —
two text files side by side, drawn the way [Meld](https://meldmerge.org/)
draws them.

```
 ┌─ A · Even the Past · 2009 demo ──┬─────────┬─ B · Even the Past ⟨AI⟩ ────┐
 │ 0:00              ▂▃▅▇▅▃▂        │ ╲     ╱ │        ▂▃▅▇▅▃▂       0:00   │ same
 │ 0:04  "Everything I meant to"  ▅ │  ╲___╱  │ ▅  "Everything I me…" 0:03  │
 ├──────────────────────────────────┼─────────┼─────────────────────────────┤
 │ 0:12  "went out on ᴘᴀᴘᴇʀ boats"  │ ╲     ╱ │  "went out on ᴘᴇᴏᴘʟᴇ…" 0:11 │ changed
 │ 0:18              ▂▃▅▇█▇▅▃▂      │  ╲___╱  │      ▂▃▅▇█▇▅▃▂       0:17   │ ← misheard
 ├──────────────────────────────────┼─────────┼─────────────────────────────┤
 │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │    ╳    │ 0:47  ▂▃▅▇▅▃▂               │ added
 │ ░░░░░░░ nothing here ░░░░░░░░░░░ │         │       "and the tide came"   │ ← bridge
 ├──────────────────────────────────┼─────────┼─────────────────────────────┤
 │ 0:45  ▂▃▅▇█▇▅▃▂                  │    ╳    │ ░░░░░░░░░░░░░░░░░░░░░░░░░   │ removed
 │       guitar solo                │         │ ░░░░░░░░░░░░░░░░░░░░░░░░░   │ ← solo
 └──────────────────────────────────┴─────────┴─────────────────────────────┘
   [ ▶ ]  hear: ◉ A  ○ B  ○ both      [ segments ▾ ]  [ save ] [ ⤓ ]  [ open ]
```

**True scale (the default).** Each side is one continuous waveform at the same
seconds-per-pixel, so a longer passage is taller and a longer song is a longer
strip. The two strips scroll in step around a line where they show
corresponding music, level; away from it they drift apart by exactly as much
as the renditions differ.

Where that line is depends on what moves the view:

- **Scrolling by hand**: Meld's sync point — the middle of the screen, sliding
  to the top over the first half screen of the song and to the bottom over the
  last, so both songs start together at the top and end together at the
  bottom. (The first version swept the line across the whole screen over the
  whole song, so the alignment never stayed where the eye rests.)
- **Following playback**: the playhead's own line. The page stays still while
  the playhead travels from the top to the middle, scrolls under it while it
  holds the middle, and stops once the end of the song is in view while the
  playhead travels on to the bottom. What you hear always faces its
  counterpart; after pausing, the view stays as playback left it until you
  scroll.
- **Clicking the waveform while playing never moves the page under the
  pointer.** Clicked above the middle, the page waits and the playhead travels
  down from the click until it reaches the middle. Clicked below, the
  playhead glides back up to the middle over about a second, the page
  scrolling a little faster than playback to catch up. Only a jump off the
  screen (Home, a band from the list) brings the view to the playhead. The
  first version recentred on every click, so the page jumped under the pointer.

**The side you scroll on drives.** Scrolling with the pointer over a song
moves that song pixel for pixel, through everything it has; the other song
follows through the correspondences — standing still through what only the
driving song has, jumping past what only it has itself. While following
playback, the song you hear drives; revealing a band from the list hands the
scroll to the side it is shown on. Moving the pointer to the other song hands
the scroll over without moving that song on screen (the song left behind may
jump, when what was in view exists on one side only).

This took three attempts, each fixing what the previous one broke:

1. Scrolling along the longer song hid anything the other song has before the
   first correspondence above the screen — an intro left unclassified, out of
   reach of the scrollbar and of the playhead while it played.
2. Scrolling along the bands (the diff) made every second reachable, but froze
   whichever song you were reading while a stretch only the other song has went
   by — on the first real pair, over a minute of a recording standing still.
3. So the song under your hand drives. Each song's own music is reached by
   scrolling on it, and the song you are reading never freezes.

Each correspondence is joined across the gutter by a **ribbon** from its
stretch of A to its stretch of B, wherever each actually is. When the two
differ in length the ribbon widens or narrows; when the songs have drifted
apart it slants; when one side has no counterpart (`added`/`removed`) it
closes to a point on that side. That is what makes "the rework's verse runs
22 s longer" something you see rather than read.

*This replaced the first design*, which stretched both sides of every band to
the same height so corresponding music was always level. It was readable bar
by bar, but it hid the one thing a diff exists to show — which side is longer
— behind a `32s ↔ 36s` label, and ribbons had nothing left to draw. A first fix
kept bands level at their start and let the shorter side end early; that left
blank gaps inside the shorter song's waveform, which Meld's continuous panes
never have.

**Aligned** (`t`) is still there: both sides stretched to fill each band, one
shared scroll, `added`/`removed` hatched on the empty side like a diff's blank
lines. Better for reading a long correspondence bar by bar; worse at showing
what changed.

Each side's own timestamps stay visible in both, because they are what the
user needs when going back to an editor.

### Authoring segments

- **Drag** vertically on one side's waveform to select a range; drag on the
  other side to pair it. Two ranges paired → `same` (`c` toggles to `changed`).
- **Shift+click** takes a range in one click: from the region marked above it
  up to the clicked moment (Alt: from the click down to the region below).
  Marking a song is mostly "from where the last region ended to here", so it
  should cost a click, not a drag the length of a chorus.
- One range with no counterpart → `added` if it is on B, `removed` if it is on
  A. The side decides, so the bar shown while a range waits offers one button
  that names the outcome, and `a` and `r` both do it.
- **Magnet** (`m`, on by default): an edge being placed sticks to the nearest
  segment boundary, else the playhead, else the quietest moment nearby — a
  section change usually sits in a dip. Its reach is a constant ~9 px, so it
  feels the same at every zoom. Turned off, edges land where they are put.
- **Join** (`j`, or the button on the seam between two rows of the segment
  list): two segments of the same kind that touch become one. They must touch
  on every side the kind names — two `same` segments meeting on B while a
  removed solo sits between them on A must not join, or the solo would be
  swallowed. A gap under 0.05 s still counts as touching and is closed; labels
  and notes of both are kept, joined.
- **Classify a gap** in one step: a selected `unknown` band becomes `same`
  (`s`) or `changed` (`c`) when both sides have music there. When only one side
  does, it is either what that side has alone — `removed` or `added` (`a`/`r`),
  the side decides — or more of a `same`/`changed` segment it touches on both
  timelines (`s`/`c`), which is extended over it (or, touched on both ends by
  that kind, joined with both into one). The second reading is the usual one
  for an opening or an ending left out of a correspondence whose edges were
  set too tight. The segment list offers the options that gap has as *mark as*
  buttons.
- **Seed from lyrics** (`g`) proposes segments from the two SRTs, around what
  is already marked.
- Selected band: drag its edges to adjust, `1`..`4` to set its kind, `Delete`
  to drop it back to `unknown`, `n` to type a note ("new drum groove").
- With lyrics loaded, the magnet also sticks to the start and end of each sung
  line — after a marked boundary, before the playhead.
- A segment list panel doubles as a table of contents: click a row, the view
  jumps to that band.

### Playback and scrolling

One side is **audible**, the other is silent, and the choice is one key (`1`,
`2`). Both playheads move: the audible side's playhead follows its own audio,
and the silent side's playhead is the audible position mapped through the
current band's correspondence (linear inside a band, which is honest enough at
band granularity). The page follows the audible playhead — onto the focus line
in true scale, a little above centre when aligned — and the other side scrolls
in step with it.

`Tab` switches the audible side **without moving**: it maps the current
position across and keeps playing there. Comparing "how does this bar sound in
the other version" becomes one keystroke, and that is the tool's real value.

### Both sides audible

Off by default, `3` to enable. Both play from one clock with no time-stretch,
so they stay together only as long as the two recordings do; for a
playback/vocals stem pair that is exactly right, and for a rework it drifts
audibly within a bar. The mode says so when enabled rather than pretending
otherwise, and offers per-side gain so one can sit under the other.

## Hotkeys

Same spirit and, where meaningful, the same keys as player_editor.

| Key          | Action                                         |
|--------------|------------------------------------------------|
| Space        | Play / pause                                   |
| 1 / 2 / 3    | Hear A / hear B / both                         |
| Tab          | Swap audible side, keeping the position        |
| ↓ / ↑        | Next / previous segment                        |
| → / ←        | Next / previous twin of the set                |
| ] / [        | Next / previous twin in the set                |
| Drag         | Select a range on a side                       |
| c            | `same` ↔ `changed` on the selection            |
| a or r       | No counterpart: `added` (B) / `removed` (A)    |
| s            | Selected gap → `same`                          |
| j            | Join with a touching segment of the same kind  |
| g            | Seed segments from the two SRT files           |
| n            | Note on the selected segment                   |
| Delete, Esc  | Drop segment / deselect                        |
| Home         | Both playheads to the start                    |
| + / -        | Zoom (pixels per second of the taller side)    |
| Ctrl+S       | Save the twin document                         |
| Ctrl+Shift+S | Download the twin document as a file           |
| Ctrl+O       | Open audio / SRT / twin document               |
| Ctrl+Z / Y   | Undo / redo                                    |

## Audio Engine

Web Audio API, deliberately dull — there is no processing to do:

```
source(A) → GainNode(A) ┐
                        ├→ destination
source(B) → GainNode(B) ┘
```

- Both files are decoded into memory (`AudioBuffer`), as player_editor and
  track_mixer already do, so a swap of the audible side is instant.
- Muting is a gain ramp (~15 ms), not a stop: `Tab` must never click.
- `Tab` starts the other source at the mapped time and ramps the gains; both
  sources otherwise keep running so there is nothing to resynchronise.
- Peaks for the vertical waveforms are computed once per file from the decoded
  buffer and drawn on a canvas. WaveSurfer is horizontal-only, so the drawing
  is ours — which is also why peaks are cached per file and rescaled per band
  rather than recomputed on zoom.
- **Two numbers per bucket, peak and RMS.** One is not enough to compare two
  mixes: the peak of a loud master is at full scale on nearly every pixel row,
  which draws a block instead of a shape. The RMS is filled and the peak
  outlined, so the fill carries the dynamics and the outline the transients.
- **One scale per measure, shared by both sides.** The loudest RMS across the
  pair fills the column, and likewise for the peak. Normalising each side
  separately would hide the thing an AI rework shows first — that it came back
  mastered louder — and one scale for both measures would either flatten the
  fill or drive every transient into the column edge.
- The waveform itself is drawn in one neutral colour on both sides: two shapes
  can only be compared if nothing but the audio makes them differ. The band's
  kind lives in its tint, its gutter mark and its label, the way a diff viewer
  tints a hunk without recolouring the code inside it.

## Data Format — the twin document

Audio and SRT are referenced, never embedded. Documents are saved in the suite
tree via the suite bridge, as track_mixer saves `mix.json`.

Where there is no bridge — a static host, such as the published demo — Save
keeps the document in the browser's `localStorage`, under the path the bridge
would have written (`twin_diff:twin:<path>`, with the time it was saved).
Opening that twin from the index opens the browser's version instead of the
published one, and says so; *published version* forgets it. If the browser
refuses to store it (a private window, a full quota), the document is
downloaded rather than lost. Downloading is also its own action (`⤓`,
`Ctrl+Shift+S`), and the Open dialog opens a twin document from a file: when
it is one of the index's twins (its path by the naming rule is in
`twins.json`), it takes that twin's place, so the set stepper and Save treat
it as that twin.

### One document is one pair

**A twin document holds exactly two renditions of one song.** It never holds
several songs. The viewer shows two sides and nothing else, the segments inside
it are correspondences between *those* two recordings, and a document that
covered a whole reworked album would have to invent a level of structure the
tool never displays. Twelve reworked songs are twelve documents, grouped for
browsing by the index below — that is the level where "several songs" belongs.

### Naming and location

```
data/twins/
  twins.json                                    ← the index
  letter-to-nowhere/
    Even the Past — 2009 demo vs Suno.twin.json
    Paper Boats — 2009 demo vs Suno.twin.json
    Paper Boats — Suno vs Suno v2.twin.json
  back-to-normal/
    Big Three — album vs live at Rex.twin.json
  _adhoc/
    Untitled — take 3 vs take 7.twin.json
```

| | |
|---|---|
| folder | the album of **side A** — the earlier or original rendition, which is the one a user browses from. `_adhoc/` when side A comes from no album. Cross-album twins (a 2009 demo against a track on a "Suno reworks" album) file under side A's album, so a twin is always found next to the version it started from. |
| file name | `<Track Title> — <A label> vs <B label>.twin.json`, the title spelled exactly as the album's track title (variant `*`/`+` markers stripped, as the SRT convention already does) and the labels short. Human-readable with spaces, like `lyrics/<Track Title>.srt`; fetched through `encodeURI` like every other suite data path. |
| collisions | identical names get ` (2)`, ` (3)`. They mean two twins of the same pair of labels, which is usually a mistake worth seeing. |
| extension | `.twin.json`, so a glob finds every twin in the tree while the file stays ordinary JSON to every tool that reads it. |

The naming rule carries the three things that distinguish one twin from
another — *which song*, *which two renditions* — so the same song twinned more
than once (demo vs rework, then rework vs rework v2) never collides, and a
directory listing reads as a table of contents.

### `twins.json` — the index

A static web app cannot list a directory over `fetch`; this is exactly why the
suite already has `albums.json`. `twins.json` does the same job for twins, and
adds the grouping that makes several songs browsable:

```json
[
  { "file": "letter-to-nowhere/Even the Past — 2009 demo vs Suno.twin.json",
    "set": "Letter to Nowhere ↔ Suno reworks" },
  { "file": "letter-to-nowhere/Paper Boats — 2009 demo vs Suno.twin.json",
    "set": "Letter to Nowhere ↔ Suno reworks" },
  { "file": "back-to-normal/Big Three — album vs live at Rex.twin.json" }
]
```

| field | | |
|---|---|---|
| `file` | required | path under `data/twins/` |
| `set` | optional | free-text name of a group; entries sharing one are shown together |

A **set** is the answer to "several songs": the picker lists sets first ("Letter
to Nowhere ↔ Suno reworks · 12 songs"), opening one enters the first twin, and
→ / ← step to the next/previous twin **in the set** without leaving the viewer —
the same walk-through as going through a diff's files, and the sideways
counterpart of ↓ / ↑ stepping through one twin's bands. (`[` / `]` were
planned; on a Mac keyboard, and on AZERTY most of all, they are awkward to
reach.) A `‹ n / N ›` stepper in the toolbar does the same. Leaving a twin with
unsaved changes asks once: the first press only warns, the same press again
discards. The set lives in
the index rather than in the documents so that regrouping is one file to edit
and a twin can be read on its own, exactly as an album's tracks are listed in
`albums.json` and not inside each MP3.

Titles and labels for the picker come from the documents themselves — a few
hundred bytes each, fetched lazily — so nothing but the grouping is duplicated
in the index.

### The document

```json
{
  "version": 1,
  "title": "Even the Past",
  "sides": {
    "a": {
      "label": "2009 demo",
      "url": "/music/files/Letter to Nowhere/Even the Past.mp3",
      "srt": "/data/lyrics/Even the Past.srt",
      "album": "letter-to-nowhere",
      "track": "Even the Past",
      "ai": false
    },
    "b": {
      "label": "Suno rework",
      "url": "/music/files/Reworks/Even the Past (suno).mp3",
      "srt": "/data/lyrics/Even the Past (suno).srt",
      "album": "suno-reworks",
      "track": "Even the Past",
      "ai": true
    }
  },
  "segments": [
    { "kind": "same",    "a": [0, 12.4],     "b": [0, 11.9] },
    { "kind": "changed", "a": [12.4, 45.0],  "b": [11.9, 47.8],
      "label": "verse 1", "note": "new drum groove, vocal an octave up" },
    { "kind": "added",   "a": null,          "b": [47.8, 62.0],
      "label": "bridge" },
    { "kind": "removed", "a": [45.0, 58.2],  "b": null,
      "label": "guitar solo" },
    { "kind": "same",    "a": [58.2, 121.0], "b": [62.0, 130.4] }
  ],
  "seededFrom": "lyrics"
}
```

| field | | |
|---|---|---|
| `version` | required | format version, `1` |
| `title` | required | the song, as the header shows it and the file name spells it |
| `sides.a` / `sides.b` | required | `url` required; `label`, `srt`, `album`, `track`, `ai` optional |
| `sides.*.label` | optional | the rendition, e.g. `"2009 demo"`; also part of the file name |
| `sides.*.album` / `.track` | optional | provenance when the side came from an album — lets the side header name where the recording came from, and lets the picker find it again in `albums.json` |
| `segments` | required | possibly empty — an empty list is the unclassified twin |
| `segments[].kind` | required | `same`, `changed`, `added` or `removed` |
| `segments[].a` / `.b` | required | `[start, end]` in that side's seconds, or `null` |
| `segments[].label` | optional | short name shown in the band margin |
| `segments[].note` | optional | free text, shown when the band is selected |
| `seededFrom` | optional | `"lyrics"` when the list came from the SRT diff, for provenance |

`unknown` never appears in the file: it is what the gaps are.

## Suite Integration

Through the shared data structures, as everywhere in the suite — the tools read
the same formats and know nothing of each other. Twin Diff reads albums, SRT
and audio, and borrows code; nothing is added to any other app.

- **data conventions**: sides can be picked from `albums.json` / an album's
  `<name>.json` (side A from one album, side B from another — a "reworks"
  album is the natural home for the Suno versions), or opened as local files
  like player_editor does.
- **player_editor**: reuse `srt_parser.js` as-is; it is the suite's reference
  parser, and its anomaly reporting is what tells the user an SRT is too rough
  to seed from. Timing both songs there is the recommended preparation.
- **album format**: unchanged. The twin document is the only new format, and
  `docs/data-formats.md` gains a pointer to this file under *Tool-specific
  formats*, next to gig_anim's and track_mixer's.
- **track_mixer**: copy `vite-suite-bridge.js` and the thin `api.js` around it
  for reading and writing inside the data tree in dev.
- **portal / README / pages workflow**: add the app to the suite README table
  and the portal page. `APPS` in `.github/workflows/pages.yml` is optional and
  probably not worth it: a published demo would need a second rendition of a
  demo track to twin, and this is a narrow tool — a local-files walkthrough in
  the README is enough.

## Milestones

1. **Read-only viewer.** Two files in, vertical waveforms, per-band layout,
   ribbons, playback with one audible side, `Tab`, scroll sync. Segments come
   from a hand-written twin document. This alone answers the original question.
2. **Lyrics.** SRT per side (the side's `srt`, else `data/lyrics/<track>.srt`,
   else loaded by hand), lines next to the waveforms, the magnet sticking to
   line edges. *Done.*
3. **Authoring.** Drag/pair/kind/note, undo/redo, save and reload, `twins.json`
   picker with sets and → / ← stepping. *Done*, except loading a side from an
   album in the picker.
4. **Seed from lyrics.** Word alignment → one proposed segment per sung
   section, seeded around what is already marked, plus the word-level inline
   diff in the lyrics. *Done.*
5. **AI flag.** The `⟨AI⟩` badge from the twin document's `sides[].ai`. *Done.*
   The waveform tint first planned was dropped: both waveforms are one neutral
   colour so their shapes compare fairly, and a tint on one side would undo
   that.
6. **Later, maybe.** Automatic alignment: chroma features at ~10 fps and DTW
   over the two sequences give a correspondence path with no user input, from
   which bands and even kinds can be proposed — 3-minute songs are a ~2000×2000
   cost matrix, which is nothing. It would make the tool work on instrumentals
   and on songs nobody ever timed. It is also the only part that can be wrong
   in ways the user cannot see, so it comes last, as a proposal like the lyric
   seeding, and never as the document itself.

## Tech Stack

Vite + React + pnpm, JavaScript, like player_editor and track_mixer; jotai or
zustand for state (either matches an existing app); MUI for the chrome;
canvas for the waveforms, hand-drawn because they are vertical; vitest for the
model — the segment invariants, the time mapping, the fuzzy cue pairing and the
word diff are pure functions and should be tested as such, with a fixture pair
of SRTs where the words were misheard.
