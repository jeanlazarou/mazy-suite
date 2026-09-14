# Twin Diff

Two recordings of the same song, side by side, the way a text diff shows two
versions of a file. Time runs **downward**; the two waveforms face each other
across a gutter; the parts that stayed the same, were reworked, added or
dropped are marked and lined up.

![Sister Goodbye, the original recording on the left against Suno's free-jazz rework on the right: a changed verse whose amber ribbon slants across the gutter because the rework sings it later, the recording's last verse marked removed with a red ribbon closing to a point on Suno's side, Suno's long instrumental ending marked added in green, the lyrics beside each waveform, and the segment list offering "mark as" buttons for the gaps still unclassified](docs/screenshots/main-view.jpg)

It was built for a concrete case: songs recorded years ago, fed to **Suno** and
handed back reworked. Any two audio files work — a 2009 demo against a 2019
re-recording, a mix against its master, a take against another take.

[SPECIFICATION.md](SPECIFICATION.md) is the design: the concepts, the layout
model, the twin-document format, the hotkeys and the milestones.

## Run it

```bash
../scripts/link_data.sh demo twin_diff   # point it at the demo album
pnpm install
pnpm dev
```

`pnpm test` runs the model tests (vitest), `pnpm build` makes a static build in
`dist/` — audio included, so the folder can be served or shared as it is.

With `link_data.sh demo` the app offers the demo set, *Skip On Back ↔ Suno* —
→ and ← step from one of its twins to the next:
"Sister Goodbye", recorded for the album *Skip On Back*, against three Suno
reworks of it —

- **no lyrics**: the recording uploaded without its words, so the AI sang what
  it thought it heard ("a train in my mind now" came back as "I turn on my mind
  now") — the one to open first;
- **same style**: the lyrics given, and the original's style asked for;
- **free jazz**: the lyrics given, and a free-jazz arrangement asked for.

2:06 against 2:13, 2:57 and 3:29 — which is why a single shared clock would be
useless here.

The first two come fully marked up. The free-jazz one is left with two
`unknown` ranges on purpose — its opening, and a stretch only the recording
has — so you can see what an unclassified gap looks like, and settle it
yourself with its *mark as* buttons.

## What you see

```
 ┌─ A · recording ─────────┬── gutter ──┬─ B · Suno ⟨AI⟩ ─────────┐
 │ waveform, time downward │  ribbons   │ waveform, time downward │
 │ amplitude ← from gutter │  and kinds │ amplitude → from gutter │
 └─────────────────────────┴────────────┴─────────────────────────┘
```

It draws the way [Meld](https://meldmerge.org/) draws a text diff. Each side is
one continuous waveform at the same scale, so the 4:08 rework is a longer strip
than the 3:31 recording, and the two scroll in step: both start together at
the top, both end together at the bottom, and in between corresponding music
lines up in the middle of the screen, the way Meld does it. The song you scroll
on always moves; the other follows, waiting through what only yours has.

While playing, the song you hear leads, and the two line up on the playhead:
it travels down to the middle of the screen, holds there while the page
scrolls, and travels on to the bottom once the end of the song is in view.
Clicking the waveform to jump never moves the page under your pointer: click
above the middle and the playhead travels down from there; click below and it
glides back up to the middle.

Every correspondence is a **ribbon** across the gutter, from its stretch of A
to its stretch of B wherever each is. A verse the rework stretches makes the
ribbon widen; songs that have drifted apart make it slant; a bridge only one
side has closes it to a point on the other. Whatever the document does not
classify stays one faint `unknown` ribbon — which is what a fresh twin is.

`t` switches to **aligned**: both sides stretched to fill each band, level all
the way, the empty side of a one-sided band hatched. Easier to read bar by
bar, but it hides the one thing the ribbons show.

Waveforms are drawn in one neutral colour on both sides — two shapes can only
be compared if nothing but the audio makes them differ — with the RMS filled
and the peak outlined, on one scale shared by both sides so a louder master
still looks louder.

## Keys

| Key | Action |
|---|---|
| Space | play / pause |
| 1 / 2 / 3 | hear A / hear B / both |
| **Tab** | swap the audible side, keeping the position |
| drag | take a stretch of one side; drag the matching stretch on the other to pair them |
| Shift+click | take a stretch in one click: back to the region above (Alt: forward to the one below) |
| m | magnet on/off — edges stick to boundaries, the playhead, quiet moments |
| t | true scale ↔ aligned |
| a or r | no match — the waiting stretch, or the selected one-sided gap: only in B is added, only in A is removed |
| s | the selected gap is the same — or, on one side only, extends the same it touches |
| c | the selected gap is changed — or extends the changed it touches · on a segment, same ↔ changed |
| j | join the selected segment with a touching one of the same kind |
| g | seed segments from the two lyric tracks, around what is already marked |
| y | show / hide the lyrics |
| n / l | note / label on the selected segment |
| Delete | drop the selected segment back to a gap |
| Esc | forget the pending stretch |
| ↓ / ↑ | next / previous band |
| → / ← | next / previous twin of the set (also the ‹ n / N › stepper in the toolbar) |
| Home | back to the start |
| + / − / 0 | zoom in / out / reset |
| f | follow the playhead |
| Ctrl+S | save the twin document |
| Ctrl+Shift+S | download it as a file (also the ⤓ button) |
| Ctrl+Z / Ctrl+Y | undo / redo |
| ? | the key list |

One side is audible and the other silent; both playheads move, the silent one
mapped through the band it sits in. **Tab** is the one to know: it crosses the
position over to the other rendition and keeps playing there, which is how you
ask "and how does this bar sound in the other version". Clicking a waveform
seeks — click the silent side and you land on the corresponding moment, not on
its own second count.

`3` plays both at once. There is no time-stretching, so they drift apart
exactly as much as the recordings disagree: right for a playback/vocals pair,
audibly wrong for a rework, which is why it is off by default.

## Marking what differs

Drag down one side's waveform to take a stretch; the tool holds it and asks
for its counterpart. Drag the matching stretch on the other side and the two
become a `same` segment — `c` turns it into `changed`, `n` adds a note, `l` a
label. Quicker still: **Shift+click** where a section ends and the stretch
reaches back to where the last one ended; do the same on the other side and
the pair is made in two clicks.

While a stretch waits, a bar above the strips shows both ways on: take its
match on the other side, or press **only in … — added/removed** (or `a` or `r`)
when it has none. Whether that makes it `added` or `removed` follows from the
side it is on — a bridge only the rework has is added, a solo only the
original has is removed — so either key does the right thing.

A gap left unclassified can be settled in one step. It already knows what it
can become:

- music on **both sides**: `same` (`s`) or `changed` (`c`);
- music on **one side** only: `removed` (the original has it) or `added` (the
  rework has it), with `a` / `r` — **or** more of a `same` / `changed` segment it
  touches (`s` / `c`), for when that segment's edges were set too tight. The
  touching segment is extended over the gap; with segments of that kind on
  both sides of it, the three become one.

The *mark as* buttons under a gap's row offer exactly what that gap can be —
"same — extend ↓" for an opening left out of the first `same`, for instance.

Marking in small steps often leaves two neighbours that are really one — a
`same` intro and a `same` verse with nothing between them. Where two segments
of the same kind **touch**, the list shows a *join* button on the seam between
their rows, and `j` does the same for the selected one. Touching means touching
on every side the kind names: two `same` segments that meet on B while a
removed solo sits between them on A do not join, because that would swallow
the solo. A gap under 0.05 s still counts, and the join closes it; labels and
notes of both are kept.

The **magnet** keeps edges honest: one being placed sticks to a nearby
boundary, else the playhead (so you can stop playback where you hear the change
and click near it), else the quietest moment close by, where section changes
usually sit. `m` turns it off.

A drag is trimmed to the free stretch it started in, so a gesture can never
overlap a decision already made; dragging a band's edge moves it, stopping at
its neighbour. `Delete` drops a segment back to a gap, `Ctrl+Z`/`Ctrl+Y` walk
the history one gesture at a time, and `Ctrl+S` writes the document back into
`data/twins/` (through the dev-server bridge in `vite-suite-bridge.js`), adding
it to `twins.json` if it is new.

### Saving on the published demo

A static site cannot write files, so there `Ctrl+S` keeps your version **in
this browser** instead. Opening that twin again — even after closing the tab —
brings your version back, marked *your version, saved in this browser* in the
band list and in the Open dialog; its **published version** button forgets
your copy and returns to the demo's own markup.

To keep your work elsewhere, or to share it, **⤓** (`Ctrl+Shift+S`) downloads
the twin document as a file, and **open… → Twin document from a file** opens
it again. The audio and lyrics are found by the paths the document names, so a
downloaded demo twin reopens on the demo site.

## Lyrics

A side's lyrics are the SRT file its `srt` names, else
`data/lyrics/<track title>.srt` (the audio file's name for a side from no
album), else whatever you load with the **♪ lyrics…** button in its header.
The sung lines appear beside the waveform at the moment they are sung, and when
both sides have lyrics the words one sings and the other doesn't are
highlighted — in the demo, "**a train in** my mind now" against "**I turn on**
my mind now". `y` hides them; the magnet sticks edges to where a line starts
or ends.

**Seed from lyrics** (`g`, or the button above the segment list) proposes
segments from the two tracks: one per sung section, `changed` wherever a word
differs, `removed`/`added` where only one side sings, with the breaks between
sections left for your ear. It only fills gaps — whatever you already marked
stays — and it is one Ctrl+Z.

Where the SRT files come from matters. The **original's** needs its real words:
align them from a lyrics file (`srt_generator song.mp3 lyrics.txt --mix`) —
whisper mishears the original too, and two raw transcripts compared show where
whisper disagrees with itself. The **rework's** must not get the original's
words: aligning them onto it would write over exactly the mishearings you want
to see. Transcribe it (`srt_generator rework.mp3 --mix`) — or, if someone has
written down what the rework actually sings, align *those*: they are its own
words.

The demo's SRTs were drafted that way — both originals aligned from their
lyrics, the no-lyrics rework aligned from the words it was heard to sing — and
then timed by ear. The other two reworks were given the lyrics and sang them
as written, but a transcription mishears them anyway ("I **train** my mind",
"power **games**"), which would show as changes the rework never made: their
SRTs carry the written words, placed where the rework actually sings them.

## State

Milestones 1 to 5 of the spec: viewer, lyrics, authoring, seeding from lyrics,
the AI badge. Not yet: picking a side from an album in the Open dialog.
Automatic alignment (milestone 6) remains a maybe.

```
src/model/     pure: the document, the bands, the view, the peaks, the edits,
               the magnet, the SRT reader, the lyrics diff — unit-tested
src/audio/     the only Web Audio in the app
src/render/    canvas drawing
src/actions/   one user action per file
src/state/     store shape, selectors, undo history
```

## Twin documents

A twin document is JSON, holds exactly two renditions of one song, and
references the audio rather than embedding it:

```json
{
  "version": 1,
  "title": "Sister Goodbye",
  "sides": {
    "a": { "label": "recording", "url": "/music/files/Skip On Back/Sister Goodbye.mp3", "album": "skip-on-back" },
    "b": { "label": "Suno no lyrics", "url": "/music/files/Suno reworks/Sister Goodbye (No Lyrics).mp3", "ai": true }
  },
  "segments": [
    { "kind": "same",    "a": [0, 18],   "b": [0, 14] },
    { "kind": "changed", "a": [18, 70],  "b": [14, 78], "label": "verse 1" },
    { "kind": "added",   "a": null,      "b": [78, 96], "label": "bridge" },
    { "kind": "removed", "a": [70, 92],  "b": null,     "label": "guitar solo" }
  ]
}
```

They live under `data/twins/<album of side A>/<Title> — <A label> vs <B
label>.twin.json`, listed in `data/twins/twins.json` (a static app cannot read
a directory, which is why `albums.json` exists too). An entry's optional `set`
groups the twins of a reworked album so they can be browsed together.

`segments` may be empty — that is a valid document, and the state every
session starts in. The full format, including the invariants and what happens
when a document breaks them, is in
[SPECIFICATION.md](SPECIFICATION.md#data-format--the-twin-document).
