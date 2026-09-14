# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

**Twin Diff** — a browser-based side-by-side diff viewer for two recordings of
the same song, for the Mazy Suite (the repository root). Two vertical
waveforms, time downward, with the parts that stayed the same, were reworked,
added or dropped marked and lined up. Not an editor: it never writes audio.

**Read [SPECIFICATION.md](SPECIFICATION.md) first** — it defines the layout
model, the twin-document format, the hotkeys and the milestones.

## Key design decisions (do not re-litigate without asking)

- **Each side keeps its own time axis.** The document is a list of
  correspondences between a range of A and a range of B; the layout follows
  the correspondences, not the clock. A shared clock is only the default
  assumption when nothing is known — and it *is* the model's own degenerate
  case: no segments means one `unknown` band covering both songs whole.
- **One document is one pair of renditions of one song.** Several songs are
  several documents, grouped by `set` in `twins.json`.
- **True scale by default, drawn like Meld** (`src/model/view.js`). Each side
  is one continuous waveform at the same px/s; the strips scroll in step
  around an alignment line (Meld's middle sync point by hand, the playhead
  while following), so both songs start together at the top and end together
  at the bottom. Ribbons across
  the gutter join each stretch of A to its stretch of B wherever they are —
  widening, slanting, or closing to a point for a one-sided segment. This is
  the design Jean asked for after the first one (every band stretched level)
  hid which side was longer. **Aligned** (`t`) keeps that band layout as the
  alternative. Everything that draws, clicks or scrolls asks the view; nothing
  else knows which mode is on.
- **Taking a region is cheap**: Shift+click reaches back to the previous
  boundary (Alt: forward), and a **magnet** (`m`) snaps every edge to a
  boundary, else the playhead, else the quietest nearby moment, within a
  constant ~9 px (`src/model/snap.js`).
- **The absent side of an added/removed band gets a zero-length range**, not a
  null, at the point its timeline has reached: nothing to draw, and a playhead
  that stands still there. Everything downstream then needs no special case.
- **The position lives on the audible side** (`engine.clock`); the silent
  side's position is a mapped display value. Only the audible side's audio
  plays at real speed, so only its clock can be authoritative.
- **No time-stretching, ever.** `both` drifts, and says so.
- **Peak *and* RMS per bucket, one scale per measure shared by both sides.**
  Peak alone draws a block for any loud master; separate scales per side would
  hide that a rework came back louder.
- **Waveforms are one neutral colour on both sides.** The kind lives in the
  band tint, the gutter mark and the label — two shapes can only be compared
  if nothing but the audio makes them differ.
- **Nothing is added to any other suite app.** Integration is through the
  shared data formats only.

## Current state

**Milestones 1–5 implemented** — Vite + React 19 + zustand + pnpm, custom
`<canvas>` rendering.

- `pnpm dev` / `pnpm test` (vitest, 214 tests) / `pnpm build`.
- M1: twin document loaded from `data/twins/` (`twins.json` index, single
  entry opens on its own) or two local audio files; vertical facing
  waveforms; per-band layout with hatched one-sided bands; band list as a
  table of contents; playback with one audible side, `Tab` swap keeping the
  position, `3` for both; click-to-seek that maps across sides; zoom; follow;
  hotkeys help.
- M3: drag a stretch on one side (held as `pending`, shown as a solid
  outline), drag its counterpart on the other to pair them. While a stretch
  waits, `PendingBar` shows both ways on with buttons; `a` and `r` both mark it
  one-sided, the kind following from the side (they used to refuse the
  "wrong" letter, which made the one-sided path look missing). A drag released
  over the gutter or the other song ends at its last position on its own side.
  Digit hotkeys match `event.code`, so they work on AZERTY. **Join** (`j`, or
  the seam button in the band list): two segments merge only when they are
  the same kind and touch on *every* side they name (`canMerge` in
  `edits.js`, tolerance `TOUCH` = 0.05 s); segments sharing no side are
  stepped over when looking for the neighbour, labels/notes are joined.
  Unknown bands under `TOUCH` are "slivers" — kept in the layout, hidden from
  the list and labels. Labels and notes are typed in `TextDialog` (a
  `<dialog>`, never `window.prompt`, which browsers start offering to block
  after one use); hotkeys are ignored while any `dialog[open]` exists. `c` toggles
  same ↔ changed; `n`/`l` note and label; `Delete` drops a segment; band-edge
  drag resizes, clamped by neighbours; snapshot undo/redo, one entry per
  gesture (`src/state/history.js`); `Ctrl+S` saves through the bridge and
  keeps `twins.json` in step; without a bridge it keeps the document in
  `localStorage` (`src/state/local_twins.js`, `localCopy` in the store), and
  opening the twin from the index prefers that copy until *published version*
  forgets it. `⤓`/`Ctrl+Shift+S` downloads; the Open dialog opens a twin
  document from a file. Every edit
  goes through `applySegments`, and a new segment is left selected so the
  follow-up keys have a target.
- M2: lyrics per side (`load_lyrics.js`: the side's `srt`, else
  `data/lyrics/<track or audio file stem>.srt`, else the ♪ button in the side
  header; absence is silent). `src/model/srt.js` is a forgiving copy of
  player_editor's parser (reports, never rejects). `LyricsLayer` draws each
  line's bar at its true timing and its text pushed down only when it would
  overprint the line above. The magnet sticks to line edges (rank after
  marked boundaries). `y` toggles.
- M4: `src/model/lyrics_diff.js`. **Words, not lines, are aligned** (LCS over
  the whole song, each word timed by its position in its cue) — line pairing
  was tried first and paired 17 of 39/32 cues on the first real pair,
  because independent transcripts cut songs into cues differently. Hunks read
  like a text diff: a disagreement on both sides between the same anchors is
  `changed`; agreements shorter than `ANCHOR_WORDS` between two changes fold
  in. **Proposed segments are sections**, cut where either side is silent for
  `SECTION_BREAK` (8 s) — word-level cuts gave 37 segments. One silence is one
  cut even when the sides fall silent at different words. `alignWords` is a
  weighted LCS (DP with traceback, not the plain table walk): a match costs
  when the skip reaching it is lopsided (`SKEW_ALLOWED` 8 words, 0.4 per word
  beyond, capped at 4), so a verse one side repeats is not paired across both
  copies — the demo's no-lyrics twin did exactly that under plain LCS.
  Stretched instrumental breaks skip no words and stay free. Inline word marks
  (`cueWordMarks`) carry the word-level detail. `seedInto` never touches an
  existing segment: a proposal joins only if it overlaps nothing and sits on
  the same side of every segment on both timelines (`fitsWith`).
- Gap classification (`classify_gap.js`; `gapOptions`/`applyGapOption` in
  `edits.js`): a two-sided unknown band → `s` same / `c` changed; a one-sided
  one → `a`/`r` removed/added (the side decides) **or** `s`/`c` extending a
  touching same/changed segment over it (touching on *both* timelines; both
  neighbours of that kind → joined into one). *mark as* buttons list a gap's
  options. `c` falls back to same↔changed on a segment, `a`/`r` to the pending
  stretch first.
- **In true scale, the side you scroll on drives** (`scrollDriver` in the
  store, `driver` in `view.js`): a native non-passive wheel listener in
  `TwinView` hands the scroll to the side under the pointer
  (`scrollForNewDriver` keeps that side in place), follow hands it to the
  audible side, reveal to the revealed side. The driver moves pixel for pixel;
  the other side follows through `mapTime`. Third design: scrolling along the
  longer song hid a leading one-sided stretch above the screen (Jean's
  recording intro); scrolling along the bands froze the side being read
  through the other side's one-sided stretches (Jean: "don't block side A if
  I'm on it"). Don't go back to either without asking.
- **The alignment line**: by hand, Meld's sync point (`syncPoint`: middle,
  easing to top/bottom over the first/last half screen); while following
  playback, the playhead's own line (`followPlayback`: page still until the
  playhead reaches the middle, holds it there, stops at the end while the
  playhead travels to the bottom) — passed to `makeView` as `focusY` and kept
  after pausing until the user scrolls (wheel or scrollbar drag). One
  scrollbar stays (Jean scrolls with the touchpad, pointer on the side).
- `followPlayback` runs **frame by frame** from `{ scrollTop, focusY, dt }`:
  a playhead that jumps but stays on screen (a click) never moves the page —
  above the middle the page waits, below it glides up (`FOLLOW_GLIDE`); only
  an off-screen jump recentres. The ease starts from the line *drawn* last
  frame, not one reconstructed from dt: in the browser the audio advance per
  frame never matches dt, and reconstructing left it resting ~5 px off the
  middle. Tests simulate mismatched frames.
- **Segment order is `orderSegments` (twin.js), never `Array.sort`.** A
  pairwise comparator that calls A-only and B-only segments "equal" is not a
  consistent order; the sort misplaced a new `added` segment after a later
  one on B, and classifying the gap again duplicated it. `orderSegments` is a
  stable topological order from "starts earlier on a shared side" constraints.
  Pairing also refuses a pair that crosses an existing correspondence
  (`fitsDocument`), which each side's free-gap check alone cannot see. A
  randomized edit walk in `test/gaps.test.js` guards both.
- M5: `⟨AI⟩` badge only; the planned tint was dropped (Jean agreed) because it
  would break the neutral-waveform rule.
- Sets: → / ← (not the planned `[` / `]` — awkward on Jean's Mac keyboard)
  and a `‹ n / N ›` toolbar stepper step through the twins sharing a `set` in
  `twins.json` (`placeInSet` in `src/model/sets.js`, `step_twin.js`). Leaving
  a dirty twin — stepping or the Open dialog — goes through `mayLeaveTwin`:
  the first attempt warns, the same attempt within 4 s discards (no
  `confirm()`); the Open dialog shows its warning inline, since a toast sits
  behind a modal. Saving refreshes `twins` so a new twin joins its set.
- Not yet: picking a side from an album in the Open dialog (M3), automatic
  alignment (M6, a maybe).
- **The demo's SRTs** (`examples/data/lyrics/`) are Jean's, timed by ear.
  They started as srt_generator drafts: "Old Shoes" and "Sister Goodbye"
  force-aligned from the lyrics; "Sister Goodbye (No Lyrics)" force-aligned
  from the words Jean wrote down that Suno sang (its own words, not the
  original's); "(Same Style)" and "(Free Jazz)" transcribed, then given the
  written words back — Suno sang them as written, and whisper's mishearings
  would otherwise show as changes. Check any new version against the lyrics
  for stray typos (one "againx" once turned a repeat Suno sings into a false
  `changed` pairing). Test fixtures use invented lyrics only.
- `lyricSections` moves a word that starts a section back into the previous
  one when it sits less than `SECTION_BREAK` after that section's last word
  on its own side: the op order inside an unmatched run is arbitrary, so an
  unmatched last word before the other side's long break could otherwise
  land after the cut.
- In dev only, `window.__twin` (the store), `window.__engine` and
  `window.__openTwinDoc` are exposed for driving the app from a browser
  session — how M1 was verified (CDP over Node's built-in `WebSocket`).

## Code conventions

Borrowed from `track_mixer` and `player_editor`, deliberately:

- **One user action per file in `src/actions/`**, verb-first snake_case: the
  folder listing is the app's feature list.
- `src/state/store.js` is state shape + selectors only — no actions. Actions
  read/write through `useTwinStore.getState()/setState()`.
- **Pure model in `src/model/`** (`twin.js`, `bands.js`, `view.js`,
  `peaks.js`, `edits.js`, `snap.js`, `srt.js`, `lyrics_diff.js` — every
  segment edit is a pure function of
  the list, and every screen position comes from the view): no DOM,
  no audio, unit-tested in `test/`. The layout maths and the document rules
  belong here, and the tests are the specification of the edge cases —
  boundaries between bands, one-sided bands, an empty segment list.
- **Web Audio only in `src/audio/engine.js`.** It is handed a `mapper`
  function by `main.jsx` so it never imports the store.
- Canvas drawing only in `src/render/`.
- The parser **reports** what a document got wrong (`problems`) rather than
  repairing it silently; the UI shows that list. A hand-written document
  should be told about its mistakes, not have them hidden.

## Suite context

- On the suite's demo site the app has no `./data`: `api.js` probes
  `./data/twins/twins.json` once and falls back to the site's shared `../`.
- Suite data is `../data` (or `examples/data`), linked into `public/` by
  `../scripts/link_data.sh demo|library twin_diff`.
- Sibling `player_editor` — its `srt_parser.js` is the suite's reference SRT
  parser and is what M2/M4 should reuse; its hotkey spirit is the model here.
- Sibling `track_mixer` — same scaffolding, and its `vite-suite-bridge.js` is
  what M3 should copy when the app needs to *write* twin documents into the
  data tree.
- The demo is the set *Skip On Back ↔ Suno* (`examples/data/twins/`): "Sister
  Goodbye" from the `skip-on-back` demo album against three Suno reworks in
  `examples/music/files/Suno reworks/` — no lyrics, same style, free jazz. The
  reworks are deliberately not in `albums.json`, so the player's demo only
  gains the album's two tracks. Each twin names its SRTs explicitly (`srt`):
  the same-style rework's file was named like the original, which would have
  made the lyrics lookup load the original's words for it.
- The demo twins' segments are **Jean's markup**: no lyrics and same style
  fully classified; free jazz deliberately left with two `unknown` ranges
  (its opening, and a recording-only stretch at 1:26–1:48) to show what an
  unclassified gap looks like. Never seed (`g`), classify or save over these
  documents while testing — drive the app with `window.__openTwinDoc` on a
  copy instead.
- **Any dev or preview server writes.** Its suite bridge saves through
  `public/data` into whatever `link_data.sh` points at (`examples/` in demo
  mode), so a Ctrl+S in a test against `vite`/`vite preview` edits the demo.
  To test the static behaviour, serve `dist/` with a plain static server bound
  explicitly (`python3 -m http.server PORT --bind 127.0.0.1`), open
  `http://127.0.0.1:PORT` (not `localhost`, which can resolve to another
  server on `::1`), and check a PUT gets 501 first. Stop test servers by
  `vite/bin/vite.js` — `pkill -f "vite --port"` matches nothing and leaves
  them running, each new one taking the next port.
- On a static host Save cannot write: the bridge PUT fails and the document is
  kept in the browser. A static test therefore leaves `twin_diff:twin:*`
  entries in that browser profile — use a throwaway profile.
