# How srt_generator drafts lyric timings

A technical note on the pipeline: what each stage does, and why it makes the
choices it does. The [README](../README.md) covers usage and flags; this
document covers the design.

- [The problem](#the-problem)
- [Three commitments](#three-commitments)
- [The pipeline](#the-pipeline)
- [Separation and decoding](#separation-and-decoding)
- [Forced alignment](#forced-alignment)
- [The energy gate](#the-energy-gate)
- [The invariant pass](#the-invariant-pass)
- [The consumer contract](#the-consumer-contract)
- [Evaluation and limits](#evaluation-and-limits)

## The problem

An SRT file for a song is a list of regions: an index, a start time, an end
time, and the line sung between them. Placing them by hand is slow and dull
work — a four-minute song is forty to eighty regions, each one a scrub, a
listen and two edge drags.

The obvious automation is speech-to-text, and on songs it disappoints. Sung
vowels are held and bent, consonants are swallowed, and a model trained on
speech returns a transcript that is roughly right and specifically wrong.
Correcting invented words costs more than typing them.

But the words were never missing. Whoever wants the SRT wrote the song, or has
the sheet in front of them. What they lack is the mapping of those lines onto
the timeline — a much narrower problem, and a much more tractable one.

## Three commitments

**Alignment, not transcription.** The preferred input is the audio *and* a
text file of the lyrics, one line per SRT entry, in singing order, fully
expanded. Given both, the model solves the constrained problem: these exact
tokens occur, in this order, somewhere in this audio; find the boundaries.
Free transcription stays as a fallback when no lyrics exist — the words come
out rough, but the timings are still worth having.

**A draft, not a deliverable.** The output is finished in **player_editor**,
the suite's timing editor. That is a design input, not a disclaimer: the
pipeline is allowed to be approximate about *placement* and is not allowed to
be approximate about *structure*. A region 200 ms late is a keypress to fix. A
file the editor refuses to parse is worth nothing, however good the numbers
inside it are.

**Errors are not symmetric.** This one recurs at every stage and explains the
choices that look over-cautious in isolation:

> A region that runs **too long** is visible in the editor and costs one edge
> drag. A region that ends **too early** has silently dropped singing the
> editor cannot show — you have to notice the line is cut, find where, and
> rebuild the region. When in doubt, the pipeline keeps audio.

So edges are only ever pulled inward from what the aligner claimed, never
pushed outward past it; a trim that would leave a region under the minimum
duration is abandoned rather than applied; and the one feature that can cut a
region at an internal silence ships turned off.

## The pipeline

Six stages, one module each. The two learned components sit in the middle;
everything around them is deterministic array arithmetic, and unit-tested.

![The six stages of the pipeline. song.mp3 enters separate.separate_vocals
(demucs, --mix only, cached); the stem is decoded once by align.load_audio to a
16 kHz mono float array; lyrics.txt enters align.align_lyrics; the segments pass
through trim.trim_segments, srt_writer.postprocess and srt_writer.write_srt to
reach player_editor. A dashed line shows the decoded array feeding the trimmer
directly, rather than being decoded a second
time.](images/pipeline.svg)

Omitting the lyrics file swaps `align_lyrics` for `align.transcribe` and
changes nothing downstream.

The audio is decoded exactly once. The same float array feeds the aligner and
the trimmer, so the energy gate measures the identical samples the alignment
was computed from. Handing stable-ts an array rather than a path also
sidesteps its streaming ffmpeg loader, which spills harmless but noisy
broken-pipe errors when alignment finishes before the end of the file.

## Separation and decoding

Separation is opt-in and it is the only optional stage. There are two ways in:

- **A full mix**, passed with `--mix`. htdemucs isolates the vocal first, and
  everything downstream runs on that stem rather than on the mix.
- **A vocal already on its own** — a stem, or a clean vocal take — passed
  without `--mix`. Nothing is separated; the file goes straight to decoding.

Both paths converge on the same array and the same four stages after it. The
choice affects quality, not structure: everything below is identical either
way.

With `--mix` the source is a finished mix, and the drums and guitars are noise
for both of the jobs that follow. htdemucs runs in two-stem mode to pull out
the vocal, and the stem is cached under a `separated/` folder beside the
source audio, keyed by model name and file stem.

Separation is the most expensive stage and its input never changes, so a
re-run with different timing flags skips it entirely. Iterating on the trim
parameters costs seconds rather than minutes — which is what makes those
parameters worth exposing at all.

The vocal stem matters for more than denoising. The energy gate below assumes
the signal is quiet between sung lines. That is true of an isolated vocal and
false of a full mix, where a band plays through every gap. Separation is what
makes the cheap gate downstream a valid measurement rather than a coin flip.

### The deliberate CPU path

On Apple Silicon `--device auto` resolves to CPU for both models. This is a
recorded finding, not caution: htdemucs contains a convolution whose output
channel count exceeds the MPS backend's 65536 limit, and
`PYTORCH_ENABLE_MPS_FALLBACK` does not rescue it — that escape hatch covers
unimplemented operations, not size limits on implemented ones. CUDA is picked
up automatically when present, and `--device mps` stays in the interface for a
future torch that lifts the ceiling.

## Forced alignment

Alignment runs through stable-ts over whisper `large-v3`. The lyrics lines are
joined with newlines and passed with `original_split=True`, which is the
load-bearing detail: it holds the model to the caller's line breaks, so the
returned segments correspond one-to-one with the lines in the lyrics file.

The contract between input and output is therefore exact — line *n* of the
lyrics becomes entry *n* of the SRT — and the tool never has to guess how to
group words into regions. That grouping step is where free transcription
usually produces something a human re-cuts anyway.

### There is no transcription step

This is worth spelling out, because from outside the two look similar: the
alignment path never asks the model what is being sung, and there is no point
at which a transcript is produced and then matched against the lyrics.

The lyrics are tokenised and handed to the decoder as its *input* rather than
generated by it. Cross-attention weights between those tokens and the audio
frames are captured as the pass runs, median-filtered, and put through dynamic
time warping, which maps each token's position in the text onto a position in
time. The word boundaries fall out of that mapping.

So the model is never in a position to choose a word. It cannot mis-hear
"turn your back" as "turn you back", because it is not listening for words at
all — it is told the words and asked where they land. The only thing it can get
wrong is *when*.

Two consequences run through the rest of this document:

- **Every error is a timing error.** There is no separate question of whether
  the words came out right, which is what makes region placement the only thing
  worth measuring.
- **Every line must be placed somewhere.** Dynamic time warping maps every
  token to some frame; there is no outcome in which a word is reported as
  absent from the audio. Faced with a passage where nothing is sung, the
  aligner cannot conclude "these lines are not here" — it has to put them
  somewhere. That is precisely what produces the failure in
  [§ The dominant defect: a collapsed run](#the-dominant-defect-a-collapsed-run).

The free-transcription fallback is a genuinely different code path.
`align.transcribe` does generate text, and its words are as unreliable on songs
as [§ Three commitments](#three-commitments) warns — but it is only reached
when no lyrics file is given.

### Nothing is ever dropped

That correspondence is the cost asymmetry again, at the scale of the whole
file, and it is the property that decides what editing the draft feels like.

No stage downstream of the aligner can lose a line. Trimming only moves edges;
it appends every segment it is given, including ones it declines to touch. The
invariant pass discards only segments whose text is empty, and `load_lyrics`
has already filtered blank lines out of the input, so no lyrics line can reach
that filter. Repairs shave and push edges; they never drop or merge a region.

So every line reaches the SRT — including a line the aligner placed at a
completely wrong moment. Opening the draft in player_editor is therefore always
*consolidation*: dragging a misplaced line to where it belongs, with the whole
lyric already present and in order. It is never an audit for a line that
silently went missing. A line in the wrong place announces itself the moment
you play the song; an absent line does not.

This is enforced, not hoped for. `pair_with_lyrics` refuses to build the
segment list unless the aligner returned exactly one segment per lyrics line,
and the run stops with both counts named rather than writing a draft that is
quietly short:

```
Aligner returned 20 segments for 21 lyrics lines. Refusing to write a draft
that drops or duplicates lines: player_editor binds lyrics to regions by
position, so every line after the mismatch would sit on the wrong region.
```

That same function is what puts the text into the SRT, and it takes the text
from the lyrics file rather than from the model's echo of it. Your
capitalisation, punctuation and spelling survive verbatim; the model
contributes timings and nothing else. Why a *shifted* file is worse than a
missing one is [§ Position is the only link](#position-is-the-only-link).

What comes back is a start, an end and the text for each line. The starts are
good. The ends are the problem: an aligner has no notion of a line being
*over*, so it stretches each line's end toward wherever the next line begins.
Across a two-bar instrumental fill, that produces a region tens of seconds
long holding a line that was sung in two.

## The energy gate

Because the aligner works on a separated vocal, the fix needs no model. The
stem is divided into 20 ms frames — 50 per second — and the RMS of each frame
is compared against a threshold relative to the loudest frame in the track,
`--trim-db`, default −40 dB. That yields one boolean per frame: is anyone
singing here. Within each region the edges are then snapped to the first and
last voiced frame, with 120 ms of padding so consonant onsets and decaying
tails survive.

Three guards keep the gate honest, all of them the cost asymmetry showing
through:

- **Edges only shrink.** The snapped start is `max`'d against the original and
  the snapped end `min`'d against it, so the gate can never claim audio the
  aligner did not.
- **A too-short result is discarded.** If trimming would leave the region under
  `--min-duration`, the original edges are kept. A single voiced blip inside a
  long region is not evidence that the rest is silence.
- **A silent region is left alone.** No voiced frame in the window means no
  measurement, not a zero-length region.

### Bounding the search

Edge-snapping alone cannot repair the stretched-end case, because the far edge
of an over-long region often lands exactly on the *next* line's singing —
voiced audio, so there is nothing to trim back to. `--max-duration` (default
5 s, about one sung line) solves it by bounding where the gate may look: the
search window is the region's start plus the cap, and the region closes on the
last voiced frame inside that window.

![A ten-second timeline. Vocal energy rises above the −40 dB gate from 1 to 2
seconds and again from 8 to 9 seconds. The aligner claimed the region 1.00 to
8.00, where the next line begins. A dashed cap at 6 seconds marks start plus
five seconds, and a bracket shows the gate may only search between 1 and 6
seconds. The trimmed region closes at 2.12 seconds.](images/trim-cap.svg)

The line is sung from 1 s to 2 s; the aligner stretched its end to 8 s, where
the next line's voice begins. Trimming against the whole region would find the
next line's first voiced frame right at that edge and change nothing. Bounded
to `start + 5 s`, the
gate closes the region on the last voiced frame it can see — 2.12 s including
the pad — rather than at the cap itself, so the cut lands on silence and not
mid-word.

### The feature that stays off

A more aggressive variant exists. `--max-gap` closes a region at its first
internal silence longer than a given span. It is off by default and labelled
experimental, for exactly the reason above: when the aligner slips — most
often on a repeated line, where the same words appear several times in the
audio — the flag guesses which side of a silence the line belongs to, and a
wrong guess deletes real singing.

The duration cap is the safe substitute. Too low a cap ends a region early and
visibly; it cannot swallow a whole line.

## The invariant pass

Everything so far places regions *well*. The closing pass places them
*legally*. player_editor flattens the SRT into a single ordered list of
alternating start and end markers, so two overlapping regions do not merely
look wrong — they scramble which line is highlighted during playback. And
aligners routinely emit zero-length regions, and regions that open a few
milliseconds inside their predecessor.

`srt_writer.postprocess` makes four guarantees at once, in one forward sweep
over the start-sorted segments:

```python
start = max(start, 0.0)
start = max(start, prev_end + min_gap)      # no overlap
end   = min(end, start + max_duration)      # length cap
end   = min(end, raw_start[i + 1] - min_gap)  # shave the stretched tail
end   = max(end, start + min_duration)      # last resort: keep it legal
```

Two details carry the design. The tail is shaved against the *raw* next start
rather than the placed one, because the following segment has not been
positioned yet and can only ever move later — so the raw value is a sound
lower bound. And the order of the last two lines encodes the repair policy:
shrink the end first, since the end is the side the aligner stretched, and
only when the end cannot shrink without collapsing the region does the *next*
region's start get pushed instead.

Each degenerate segment therefore displaces its successor by at most
`min_duration + min_gap`, so the cascade is bounded and cannot walk a whole
song forward.

### A real case

Entries 8, 9 and 10 of `AgainsMyself.srt`, where the aligner opened entry 9
ten milliseconds after entry 8 started — inside its region:

![Before and after the invariant pass. Before, entry 9 opens inside entry 8 and
the two overlap by 0.19 seconds, shown as a tinted band. After, entry 8 keeps
its edges because its end is already at the minimum duration, entry 9's start
is pushed forward by 0.21 seconds, and entry 10 is capped at five
seconds.](images/invariant-pass.svg)

| entry | before | after | |
|---|---|---|---|
| 8 | 21.680 → 21.880 | 21.680 → 21.880 | unchanged — already at `min_duration` |
| 9 | 21.690 → 22.020 | 21.900 → 22.100 | start pushed +0.210 |
| 10 | 22.760 → 29.820 | 22.760 → 27.760 | capped at 5 s |

Entry 8 is already exactly `min_duration` long, so shaving its end would
collapse it. The pass falls through to its last resort and pushes entry 9's
start instead — the only branch that moves a start, and here the only one
available.

### Why the guarantees hold

The four properties player_editor needs follow from the sweep rather than
being checked after it:

- **Non-overlap** is line 2 directly.
- **Minimum length** is the final line, which no later line can undo.
- **Starts strictly increase**, since `start[i+1] ≥ end[i] + min_gap >
  start[i]`.
- **Ends strictly increase** as a consequence of the other two, since
  `end[i+1] ≥ start[i+1] + min_duration ≥ end[i] + min_gap + min_duration`.

The one case where the cap could be violated is `min_duration` exceeding it,
which the CLI rejects at parse time rather than resolving silently.

This pass runs unconditionally, after trimming and also when trimming is off
with `--no-trim`. It is the guarantee, not an optimisation, and it is why a
rough draft still opens cleanly.

## The consumer contract

The target parser — [`player_editor/src/srt_parser.js`](../../player_editor/src/srt_parser.js)
— is deliberately strict, and knowing precisely how it fails is what lets the
generator promise it will not. But the strictness is downstream of a design
decision in the editor itself, and that decision is worth stating first,
because everything the generator guarantees exists to serve it.

### Position is the only link

There is no link between a lyric line and its region beyond position. The
parser produces two parallel arrays — `lyrics`, the text, and `timings`, a flat
list of alternating starts and ends — and line *i* is bound to
`timings[i * 2]` and `timings[i * 2 + 1]`. Index arithmetic, nothing else. No
ids, no keys, no references.

The editor commits to that completely. Editing the lyrics means editing one
text blob: `song.lyrics.join("\n")` into a textarea and `split("\n")` back out
again. There is no per-line identity that could be preserved even in principle,
because there is none to begin with.

This is what makes the editor pleasant to use, and the reason deserves saying
out loud. Words and timings are edited independently: you can retype the entire
lyric without disturbing a single region, and drag every region without
touching a word. There is no "which line does this region belong to?" state to
maintain, no re-linking step after an edit, no orphaned regions to garbage
collect. Nudging a region is a number changing in an array.

![Two panels. On the left, as generated: four lyrics lines, each spanning
exactly two cells of the flat timings array, so line i owns timings i*2 and
i*2+1. On the right, one region was never generated, so after the missing line
is restored by hand, line 2 binds to line 3's region, line 3 binds to line 4's,
and line 4 has no region at all.](images/positional-binding.svg)

The bill for that simplicity is paid on the producing side, and it is the
reason for two of the guarantees above:

- **Completeness** ([§ Nothing is ever dropped](#nothing-is-ever-dropped)). A
  dropped line is not a local problem. The file it produces is perfectly well
  formed — it simply has one fewer entry — so nothing flags it. But the moment
  you restore the missing line in the editor, every line after it shifts onto
  its neighbour's region and the last line has no region at all. One dropped
  line costs the entire tail of the song, which is why the generator refuses to
  produce one.
- **Ordering and non-overlap** ([§ The invariant pass](#the-invariant-pass)).
  The flat timings array is read positionally too, so regions that overlap or
  run out of order scramble which line is highlighted during playback.

Strictness in the parser is therefore not fussiness. It is the editor declining
to guess, once, at the point where guessing is still cheap.

### What the parser checks

Each of its rules maps onto a stage above.

| What the parser does | What the generator guarantees | Where |
|---|---|---|
| Abandons the file unless the very first line is exactly `1` | Indices renumbered `1…n` at serialisation, whatever the aligner returned | `to_srt` |
| Hard error when `from >= to` | Every region at least `min_duration` long | `postprocess` |
| Warns when a start or end is not later than its predecessor's | Both sequences strictly increase | `postprocess` |
| Flattens regions into one alternating list of markers | No two regions overlap; `min_gap` between them | `postprocess` |
| Splits on `\n`, treats an empty line as a block break | LF endings, one blank line between blocks, trailing newline, no CR | `write_srt` |
| Parses seconds after replacing the comma with a period | Timestamps `HH:MM:SS,mmm`, rounded to whole milliseconds | `format_timestamp` |

The parser's own rules are pinned in the generator's tests, including the
first-line-must-be-`1` bail-out — a behaviour of the consumer that no SRT
specification would tell you about. That is the part that generalises: the
output contract is not "valid SRT", it is "what this specific reader
accepts", and it is worth writing down as executable assertions on the
producing side.

## Evaluation and limits

The deterministic stages carry 65 unit tests, several of them regressions
named after the real song and entry number that produced them — the
pathological inputs in the suite are recorded aligner output, not invented
edge cases.

```sh
uv run python -m pytest
```

The end-to-end check replays `AgainsMyself.srt`, a draft generated before the
invariant pass existed, back through the current one:

| | before | after |
|---|---|---|
| overlapping regions | 1 | 0 |
| regions over 5 s | 4 | 0 |
| longest region | 49.59 s | 5.00 s |
| entries | 21 | 21 |

The entry count is the meaningful row: 21 in, 21 out. Even against input this
degenerate — an overlap and four regions stretched past 5 s — the pass repairs
by moving edges only, so the correspondence from [§ Nothing is ever
dropped](#nothing-is-ever-dropped) holds. The editor opens a file with the
right number of lines in the right order, and the remaining work is nudging.

### Measuring the real objective

Tests and replays check that the pipeline holds its own invariants. Neither
measures the thing the tool exists to reduce, which is how long a person spends
repairing the draft. The only honest measurement of that is the difference
between what the tool produced and what the user actually saved from
player_editor, so that comparison is a script:

```sh
uv run python tools/compare_srt.py draft.srt fixed.srt [--table]
uv run python tools/compare_srt.py --corpus <folder>
```

It reports how far every region had to move, bucketed by the editing action
each distance implies, and flags the failure signatures described below. A
companion script, `tools/audit_corpus.py`, checks the corrected files
themselves before anything is measured against them — see [§ A note on
reproducibility](#a-note-on-reproducibility) for why that turned out to be
necessary.

### The corpus

Thirty-eight songs, 1600 regions, three complete albums by one artist, all
recorded in 2026 and all unprocessed vocal stems — no instruments, no effects
— so `--mix` was not used and demucs is not involved. Every other setting is
the shipped default, whisper `large-v3` on CPU. Lyrics were recovered from the
corrected SRTs with `tools/srt_to_lyrics.py`, and the corrected SRTs are
ground truth for both the words and the timings.

| album | songs | regions | re-placed | songs with a collapsed run |
|---|---|---|---|---|
| **Chapter 22** | 12 | 501 | 72 (**14%**) | 5 of 12 |
| **95%** | 13 | 593 | 218 (**37%**) | 11 of 13 |
| **Nothing New** | 13 | 506 | 142 (**28%**) | 9 of 13 |

"Nothing New" was finished while this document was being written, growing from
six songs to thirteen. Its rate hardly moved on the way: **28% on the first
six, 27% at eleven, 28% at thirteen**. That is the most reassuring number in
this section, because three of the original six had been brought to this
evaluation *because* they had gone badly, and the seven added later were not
selected for anything. The selection bias that made the early figure
untrustworthy turned out not to have distorted it.

One song was excluded entirely: it has two voices singing over each other, so
its corrected file records *editorial* decisions about which line to show, not
timing corrections. The tool emits one region per line by construction and
cannot score well on it however good it gets.

### No single rate describes the tool

The albums differ by a factor of two and a half, and that is the most
important number in this document: **there is no such thing as "the" failure
rate here**. Any single figure would be an accident of which album it came
from.

But the spread *within* an album is larger still:

| album | best song | worst song | spread |
|---|---|---|---|
| Chapter 22 | 0% | 44% | 15 points of standard deviation |
| 95% | 0% | 91% | 34 |
| Nothing New | 4% | 91% | 27 |

"95%" contains both "Cucumber Party", where not one of 35 regions needed
re-placing, and "Into Chaos", where 91% did. They were worked on days apart,
same voice, same setup. "Nothing New" spans the same full range: "Mike on the
Floor" needed 2 of 46 regions moved, "Still In Debt" 30 of 33, and they were
recorded and exported the same week.

A one-way analysis of variance over all 38 per-song rates puts a number on
that. Grouping by album gives **F = 2.7**, and album membership accounts for
only **13% of the variance** between songs — so the album means differ mostly
because each is a small sample drawn from a very wide per-song distribution,
not because the albums are really different. Which album a song comes from is
nearly uninformative about how it will align.

The practical consequence runs through the rest of this section. **Per-song
difficulty cannot be predicted, so it has to be detected.**

### The variance is unexplained

Twenty-one properties were measured per song and correlated against the
align-failure rate, looking for what separates an easy song from a hard one:

| property | Chapter 22 | 95% | correlation |
|---|---|---|---|
| voiced fraction | 37% | 37% | −0.29 |
| silence share | 26% | 29% | +0.43 |
| longest silence | 23 s | 28 s | +0.51 |
| repeated lines | 44% | 50% | +0.24 |
| words per line | 3.3 | 3.1 | −0.26 |
| lines per minute | 11.6 | 13.0 | −0.31 |
| peak level | −1.8 dB | −1.8 dB | −0.02 |
| noise floor | −74.8 dB | −71.4 dB | −0.13 |
| signal-to-noise | 50.1 dB | 47.3 dB | +0.11 |
| stereo correlation | 1.000 | 1.000 | — |
| mid-phrase line breaks | 18% | 25% | +0.06 |
| lines containing digits | 1.3% | 3.9% | **+0.59** |

The albums are indistinguishable on nearly all of it. Structure, loudness,
noise floor, stereo content, line length, repetition: the same. Every file is
dual mono, 32-bit float, unclipped, from the same export path.

Two candidates were tested and rejected outright. **Recording age** — one
track carries a 2014 date, but that is the backing it was built on; its vocal
was re-recorded this year, like every other vocal in the corpus, so there is no
age variable at all. **Line segmentation** — the hypothesis that splitting
lyrics the way they are sung, rather than into grammatical sentences, gives the
aligner artificial boundaries. Measuring how often a line break falls inside
continuous voicing gives a correlation of **+0.06**: "City to City" has 6%
mid-phrase breaks and needed 88% of its regions re-placed, while "Cucumber
Party" has 38% and needed none.

Two properties do predict trouble within songs — the longest silence (+0.51)
and digits in the lyrics (+0.59) — but neither accounts for the difference
between easy and hard songs in general. Two more were added later, after the
corpus was complete, testing whether sung pronunciation drifting from the
written words is what matters: syllables per second of voiced audio
(**−0.21**) and the share of voiced time spent in sustained notes
(**no trend**). They are the subject of [§ Sung pronunciation: the same
hazard, generalised](#sung-pronunciation-the-same-hazard-generalised).

So the honest statement is that per-song difficulty varies from 0% to 100% for
reasons not captured by any structural or acoustic property measurable from
the files.
### Digits are a hazard worth knowing about

The one new, actionable finding from that sweep. A lyrics line containing `87`
is tokenised as digits, but it is sung as *eighty-seven*; the aligner is
matching tokens that were never performed. "Into Chaos" is 19% digit lines and
is the single worst song in the corpus — 59% of its segments failed to align,
and 91% of its regions needed re-placing. "Rumors Today" has `6:30` and `6:45`,
and both were among its misplaced entries.

Probing which lines the aligner actually drops puts a number on it directly
rather than by correlation: across eleven songs, **43% of lines containing
digits failed to align, against 19% of lines without** — a 2.3× hazard. Only
21 digit lines were in that sample, so treat the ratio as indicative, but the
direction is not in doubt.

Spelling numbers out in the lyrics file costs nothing and removes the hazard.

### Sung pronunciation: the same hazard, generalised

A digit is the extreme case of a written form that is not what gets
performed. The general case is singing itself. "Hello world" may be sung as
*Heeeelloooooworld*, with the gap between the words closed, or as *Hell oooo
wooooo rld*, with silence opened inside them. The written tokens are intact;
the acoustic evidence for their boundaries is not.

Measured as syllables per second of *voiced* audio — hold vowels and fewer
syllables fit into each second of singing — the direction is there and the
strength is not:

| third of the corpus | syllables / voiced s | mean re-placed | median |
|---|---|---|---|
| lowest (vowels held longest) | 1.95 | **39.4%** | 33.2% |
| middle | 2.47 | 22.5% | 10.0% |
| highest (closest to speech) | 3.04 | 24.8% | 13.6% |

The lowest third is clearly worse; the other two are indistinguishable from
each other. As a linear correlation it is only **−0.21**, because the
relationship is not linear and has a flat counterexample — "Dark, Deep,
Surface" has a density of 1.83 and needed zero regions moved. Confirming the
per-song view, songs containing any digit line average **43.3%** re-placed
against **22.7%** for songs with none.

The worst song in the corpus fits the profile exactly. "Still In Debt" has a
density of 1.84, 4th lowest of 38, and **68.7% of its voiced time in
sustained runs of 1.5 s or longer** against a corpus mean of 41%, 3rd
highest. Few syllables, stretched over held notes.

Two things keep this from being a finding.

**Sustained voicing alone shows nothing.** Grouped by it, the thirds run
30.7% / 22.6% / 32.1% re-placed — a U, not a trend. Whatever is happening is
not holding notes as such, and low density combined with long notes cannot be
separated from either one alone on 38 songs.

**The mechanism does not fit the catastrophic failures.** Dynamic time
warping exists to absorb time-stretching; a vowel held over 200 frames
instead of 20 is the case it handles best. What stretching plausibly destroys
is the consonant landmarks that tell the model which token it is on — which
is closer to what syllable density actually measures. But that predicts
sloppy region *edges*, errors of a few hundred milliseconds. The observed
failure in the bad songs is blocks of lines relocating by tens of seconds.
Those are different failures, and this explains the first far better than the
second.

So it is recorded as the second property out of twenty-one to show any signal
at all, and the only one besides digits — a real direction, a good
description of what the hardest songs sound like, and not a demonstrated
cause of the collapse.

### The dominant defect: a collapsed run

When the aligner loses sync it returns a pile of degenerate segments sharing a
start. The invariant pass does its job on them — the result is legal SRT — and
the result is also nonsense. From "Rumors Today", around 118 s:

```
25  121.84 → 122.04   0.200 s
26  122.06 → 122.26   0.200 s     each start pushed to the previous
27  122.28 → 122.48   0.200 s     end + min_gap, eleven times over
28  122.50 → 122.70   0.200 s
...
35  127.40 → 132.40   5.000 s
```

Eleven regions packed into 10.6 s of audio that should span 33.2 s, seven of
them at exactly `min_duration`, followed by 51.6 s of dead air. The corrected
file has no region at exactly 0.20 s anywhere, confirming the chain is an
artifact of the repair rather than anything in the song.

Two things about this failure are worth separating. It is **produced by the
repair, not by the aligner alone** — the invariant pass converts a heap of
degenerate segments into a tidy minimum-length chain, the best it can do
without knowing where those lines belong, but the tidiness disguises how little
the output means. And it is **loud**: twelve lines crammed into ten seconds
followed by a minute of silence is unmistakable in the editor's waveform, which
is how the first case was found.

### What actually fails: blocks of lines

Until now this section described the defect from the outside — what the
finished file looks like. The aligner can be asked directly. stable-ts counts
a segment as failed when it comes back with zero or negative duration, warns
with the count, and discards which ones; applying the same test to the raw
segments recovers their identities, and those are exactly the lines the
invariant pass has to legalise into minimum-length regions.

Probing eleven songs across the three albums — chosen to span the range from
"needed no work at all" to "almost entirely wrong" — gives **94 failed lines in
just 33 blocks, a mean of 2.8 consecutive lines each**, with a block of ten in
"Lost", nine in "Disrupting the Recording" and two of eight in "Into Chaos".
Only "Dark, Deep, Surface", which needed no re-placement at all, failed purely
in isolated single lines.

That reframes the defect. The aligner is not drifting gradually and losing
accuracy; it is **losing a contiguous stretch of lines outright**, and
everything downstream inherits the damage. A collapsed run in the finished SRT
is the footprint of a failure block, not the failure itself.

"Magazine Her Face" shows it exactly. Seven lines failed: 7, 8, 9, 10, 11, 21
and 27. Lines 7 to 11 are consecutive, and entry 7 is precisely where its
cascade begins — entries 1 to 6 are accurate to 0.41 s, and from 7 onward the
song is 19 to 58 s early.

### Silence is where it shows, not only where it starts

Cascades *surface* at silence. Grouping each song's re-placed regions into
contiguous clusters and asking where each cluster starts, **81% of onsets in
"Chapter 22" and 84% in "95%" sit at a silence longer than five seconds**. That
is what [§ There is no transcription step](#there-is-no-transcription-step)
predicts: dynamic time warping must map every token to some frame, so faced
with a passage where nothing is sung the aligner cannot conclude the lines are
absent — it has to put them somewhere.

But the failure blocks themselves tell a weaker story. Of the 94 failed lines,
**48% sit near a silence longer than five seconds, and the first line of each
block only 45%** — both coin flips. All these figures are true at once, and
together they say something more precise than any alone: silence is where
damage becomes *visible*, and only about half the time where it originates.

"Double 8" is the case where the two coincide. Entries 1 to 38 have a median
error of 0.18 s and all but two sit within a second. Entry 39 is out by
38.78 s — and the silence it crosses, from 125.1 s to 163.8 s, is 38.7 s long.
The error *is* the silence. Everything after is packed into the ten seconds
before the gap, because monotonicity forbids going back.

"Magazine Her Face" shows the same failure without the recovery. Entries 1 to 6
are accurate to 0.41 s. Then lines 7 to 11 fail outright, and from entry 7
onward the song is 19 to 58 s early — 25 of its 31 regions need re-placing,
with the collapse itself packed into 1.3 s of audio around 0:43 while those
lines truly belong at 62–98 s.

And silence alone is certainly not sufficient. "Visits of Secrets" contains six
silences over five seconds and needed **zero** re-placements; "Needless Days"
opens with 89.7 s of silence and needed three. Long silence is where the
aligner is *vulnerable*, not where it inevitably fails.

What makes it drop three to ten consecutive lines, roughly half the time
nowhere near a silence, is not established.

### The failure the pipeline cannot survive

One song in the corpus was not hard at all. "Bride" scored 27 of 52 regions
needing re-placement, with four collapsed runs and a median error of 7.43 s —
among the worst results measured. It also produced the warning above, which
led to the audio being examined rather than the alignment.

Its stem was missing most of its vocal. The DAW export had been made with one
vocal track still muted, so 120 seconds in the middle of the song, and the
first 30 seconds, contained **digital silence** — exact zeros, not quiet
singing. Twenty-eight of the 52 lyrics lines had no audio under them at all.

With the stem re-exported, nothing else changed:

| "Bride" | already right | nudge | drag | re-placed | median | collapsed runs |
|---|---|---|---|---|---|---|
| missing vocal track | 12 | 10 | 3 | **27** | 7.43 s | 4 |
| re-exported | **31** | 14 | 2 | **5** | **0.21 s** | **0** |

Its failed-line count went from 24 to 1. Every collapsed run in it had been the
aligner doing the only thing it could with an empty file — which is the
mechanism of this document's main defect, demonstrated by removing the cause.

This is worth separating from everything else here because it is a different
class of problem. The tool cannot align against audio that is not there, and no
amount of repair will help.

Detecting it is harder than it first appears, and the first attempt was wrong.
A recorded stem has a noise floor, so exact zeros mean no track was playing
rather than that the singing was soft — which seemed to make "a region sitting
on digital silence" a clean signal for a bad export. It is not. A DAW writes
zeros wherever no track plays, so a vocal stem is mostly zeros by nature:
across this corpus every stem is **40–74% digital silence, with runs up to
90 seconds**, and all of them are correct. A region landing on zeros is
therefore usually a *misplaced region*, and only occasionally a missing track.

The two cannot be told apart without knowing where the line really belongs,
which is exactly what the tool does not have. So the warning reports the
observation and only raises the export when the share is large enough to be
implausible as misplacement — 40% of regions or more, which is "Bride" and
nothing else in the corpus:

```
24 of 52 regions sit where nothing is sung: 0:14, 1:22, 1:23, 1:24, +20 more
  — 24 of them have no audio at all, which is most of the song, so check the
  stem was exported with every vocal track unmuted
```

That threshold was set after the first version misfired: regenerated with
corrected lyrics, "Double 8" put 12 of 50 regions on digital silence purely
through misplacement, and the warning told its author to go and check a DAW
export that was perfectly fine.

Even when it fires correctly it under-reports, because it can only check where
the aligner happened to place a region. That is the safe direction for a
warning, but it is not a census.

One methodological note, since this document is partly about how the corpus was
built. Every stem was checked at the outset for being time-aligned with its
corrected SRT, and "Bride" passed: its first region sits on real audio, and the
timeline was never in question. The check confirmed the audio *started* in the
right place and said nothing about whether it was complete. Re-checking all 38
stems for lyrics lines over digital silence found no other instance:
**outside "Bride", no lyrics line in the corpus sits over digital silence.**

### Two signals survive into the finished file

The aligner cannot flag its own failure usefully — it returns a complete,
legal, confidently-wrong answer. But the damage leaves fingerprints that cost
nothing to look for.

**A collapsed run**: consecutive regions packed at exactly `min_gap`, most of
them at exactly `min_duration`. The gap chain alone is not enough — consecutive
sung lines with no pause between them produce the same spacing, and that is
correct. Duration separates them, because a collapsed region had no voiced
audio to close it either. On "Slaves and Masters", a draft needing zero
re-placements, three abutting lines of 4.86 s, 3.98 s and 0.84 s looked
identical to a collapse until the duration criterion was added.

**A region containing no voiced audio.** Across 628 measured regions this
flagged 81 genuinely misplaced regions against 4 false alarms — 95% precision,
62% recall.

A third signal comes from stable-ts itself, which reports `N/M segments failed
to align` and which the tool currently discards. Its correlation with the
re-placed share is **0.96**, the strongest of anything measured here.

### None of them is a clean separator

Each of these looked like a perfect classifier on the batch it was found in,
and each leaked on the next one. The collapsed-run signature separated the
first fifteen songs measured completely — every song with a qualifying run
needed 7 or more re-placements, every song without needed 3 or fewer. On "95%"
four songs have a run and needed 5 or fewer. The align-failure rate separates
"95%" perfectly at a 20% threshold; pooled with "Chapter 22", two songs at 18%
needed 15 and 20 re-placements.

Fitting a threshold to twelve or fifteen songs produced a clean rule twice, and
fresh data broke it twice. They are reliable in one direction only: **a strong
signal means trouble; a weak one does not mean safety.**

### What the tool does about it

Every run now ends by reporting what it found, naming entries and clock times
so the damage does not have to be hunted:

```
Wrote 40 entries to song.srt

This draft has signs of a lost alignment:
  - entries 22-36 look collapsed: 15 regions packed into 3.7s around 2:22
  - 26 of 40 regions sit where nothing is sung: 1:30, 1:39, 1:59, 2:01, +22 more
  Re-running with --anchor repairs some of these
```

It is phrased as *look here*, never as *this is fine*, because the silence
check misses 38% of misplaced regions. A quiet draft can still be wrong.

### Seeing what each stage did

`--debug` writes a self-contained HTML timeline next to the SRT: the voiced
audio and every stage — the raw alignment, the trim, the invariant pass, and
the transcript and re-warp when `--anchor` runs — drawn on one shared time
axis, with each region hovering to show its index, times and text. Lines the
aligner failed outright are marked in red on the alignment lane.

It answers the question the SRT cannot, because the file only shows the end of
the pipeline: *which* stage moved a region, and where the lanes stopped
agreeing with the singing. No dependencies and no server — one file, opened in
a browser.

Every finding about failure blocks above came out of it.

### A second opinion from the transcript

`--anchor` is an opt-in second pass, and the reasoning behind it is that the
two things whisper can do fail in *different* ways. Forced alignment knows the
words exactly but is obliged to place every line, in order, so a drift is
permanent. Free transcription gets the words wrong on songs — but it is under
no obligation to account for a lyrics line, so where it does hear something,
its timing is independent evidence.

The pass transcribes the audio freely, matches the transcript against the
lyrics with a monotonic sequence alignment over text similarity, keeps the
matches scoring above a threshold as control points, and re-warps the draft
onto them. Between two control points the draft is rescaled linearly, so
spacing the aligner got right is preserved; where a span collapsed, the lines
are spread evenly across it instead.

### Experiments that did not work

Both of the obvious ways to use a second pass were tried first, and both were
worse than doing nothing. They are recorded because they are the reason the
shipped design looks the way it does.

**Always enabling Silero VAD on the alignment pass.** It rescued the worst song
spectacularly and destroyed a perfect one. Over "Chapter 22", re-placements went
from 74 to 97 — a net regression. "Lost" improved from 20 to 2; "Visits of
Secrets" went from **0 to 38**, with a median error of 48 s and five collapsed
runs. A flawless draft turned into one of the worst in the corpus.

**Always applying the transcript re-warp.** Over the first fifteen songs,
re-placements fell from 131 to 69 — but the already-right count fell too, from
275 to 227, with about 120 regions pushed from sub-second accuracy into the
1–5 s band. Nine songs improved and six got worse. Taken alone it is a trade,
not a win.

The lesson from both is the same: a repair good enough to rescue a broken song
is aggressive enough to damage a correct one, and neither can be applied
blindly.

### Choosing between two drafts without ground truth

What makes the second pass usable is that its output can be *compared* to the
original before either is written. A region containing no voiced audio is
almost certainly in the wrong place, so whichever draft leaves fewer regions in
silence is the better one — a judgement that needs no corrected file.

Over those same fifteen songs, the selector beats both alternatives:

| | already right | nudge | drag | re-placed |
|---|---|---|---|---|
| alignment only | 275 (44%) | 135 | 87 | **131 (21%)** |
| always anchored | 227 (36%) | 123 | 209 | **69 (11%)** |
| **keep the better draft** | **285 (45%)** | 157 | 132 | **54 (9%)** |

It picked the anchored draft for 5 of those 15 songs. On the ten where
anchoring would have done harm it kept the original, including "Going Circle",
where anchoring alone would have turned 10 re-placements into 27.

Those figures come from an earlier set of drafts, before the corpus was
regenerated; the direction holds but the exact counts are not reproducible
against the current files. The two measurements below are.

### The second pass is worth more the worse the song is

"95%" is where this was really tested, because it is a complete, unfiltered
album on which the first pass fails often.

| | baseline | with `--anchor` |
|---|---|---|
| already right | 168 (28%) | **192 (32%)** |
| a nudge | 153 (26%) | 178 (30%) |
| a real drag | 54 (9%) | 128 (22%) |
| **re-placed** | **218 (37%)** | **95 (16%)** |

**Six songs improved, none got worse.** "City to City" went from 42 re-placed
regions to 8, "Disrupting the Recording" from 40 to 11, "What Remains" from 23
to 3, "Wake Up Tired" from 17 to 2. The selector kept the original for all
seven songs that were already fine, including the three with 0, 2 and 2
re-placements — the outcome plain VAD failed to achieve.

One song resisted: **"Into Chaos" was unchanged at 29 of 32 regions.** Its
transcript matched only 22 of 32 lines, because the second pass cannot hear the
song either. When there are no control points there is nothing to re-warp onto,
and that is the honest ceiling of the method.

### But it does not always help, and the selector is not always right

Repeating the same experiment on "Nothing New" gives a much weaker result:

| | baseline | with `--anchor` |
|---|---|---|
| already right | 200 (40%) | 198 (39%) |
| a nudge | 106 | 94 |
| a real drag | 58 | 91 |
| **re-placed** | **142 (28%)** | **123 (24%)** |

**Two songs improved, one got worse, ten were untouched.** "Double 8" fell
from 14 re-placements to 1 and "Never Recover" from 13 to 5; "Her Morning
Eyes" rose from 9 to 11, with its drags going from 5 to 15.

Read the two middle rows before the last one. The aggregate gain in
re-placements, 142 to 123, is paid for by drags rising from 58 to 91. The
second pass does not mostly make regions right; it mostly converts
catastrophes into regions that are merely in the wrong place by a second or
two. That is a real improvement in editing time and a smaller one than the
re-placement row alone suggests.

"Her Morning Eyes" matters more than the aggregate. The selector *chose* the
anchored draft for it — that draft had fewer regions sitting in silence — and
measured against the corrected file it was the worse of the two. It is the one
case where the ground-truth-free judgement went the wrong way.

So the claim has to be narrower than "harmed nothing". Across the two albums
the selector helped eight songs, left most alone, and hurt one. It is right
far more often than not, and it is not reliable.

### The draft its author threw away

Every other figure in this document measures a draft that was *edited*. One
song in the corpus was abandoned: its author timed it by hand rather than
start from what the tool produced. That is a more meaningful threshold than
any percentage, because it is the point where the tool stopped being worth
opening.

| "Still In Debt" | value |
|---|---|
| regions | 33 |
| already right | **1** |
| re-placed (> 5 s) | **30 (91%)** |
| median move | **49.94 s** |
| largest move | 126.83 s |
| collapsed runs | **4** |
| `--anchor` | no change |

A median move of 50 seconds on a 4.2-minute song means the typical line was
not merely late, it was somewhere else in the song entirely. Editing that is
strictly more work than timing from scratch, because every region has to be
found before it can be moved.

Three things make it the most useful single case here:

**Nothing in the input explains it.** The stem is 64.8% digital silence with a
longest run of 48 s and a peak of 0.61 — squarely inside the band every
correct stem in this corpus occupies. There is no "Bride" to find. The lyrics
contain no digits. This is the aligner failing on clean input.

**The warning fired, clearly and in the right places.** Four collapsed runs,
the most of any song in the corpus; the next worst, "Magazine Her Face", has
two, and every other song in the album has one or none. That the two highest
run counts belong to the two worst songs is suggestive, and it is exactly the
shape of the two claims this project has already had broken by fresh data —
fitted on this few songs, a run-count threshold would be a guess. It is
recorded here as something to watch, with the one-way reading from [§ None of
them is a clean separator](#none-of-them-is-a-clean-separator) still
standing: many runs means trouble, few runs does not mean safety.

**`--anchor` could not touch it.** The second pass matched 25 of its 33 lines
to the transcript — more than it matched on "Into Chaos", which was the
previous example of this ceiling — and the selector still preferred the
original draft. Having control points is not sufficient; they have to be in
the right places. This is the clearest evidence that anchoring repairs a
draft that has *drifted* and cannot rescue one that never found the song.

It ties "Into Chaos" at 91% for the worst in the corpus, and is worse by the
measure that matters: 1 of 33 regions usable against 3 of 32.

### What to actually do

The practical conclusion, and the thing a user needs rather than a rate:

1. **Run the default.** On all three albums, most songs came out needing
   nothing worse than a nudge.
2. **Read the warning.** The tool now says when a draft shows the signatures
   above, and where. Do not judge by the first few lines; a cascade can begin
   two minutes in.
3. **If warned, re-run with `--anchor`.** On one album it removed 56% of the
   re-placement work and harmed nothing; on another it removed 16% and made one
   song slightly worse. Compare the two drafts rather than trusting it.
   It costs a second model pass, so roughly double the time.
4. **If it is still wrong, stop.** "Into Chaos" and "Still In Debt" are the
   shape of a song the tool cannot do: the transcript fails where the
   alignment failed, and anchoring changes nothing. Time the song by hand
   rather than re-running with more options. The two worst songs in the
   corpus also carry its two highest collapsed-run counts, which is a hint
   about where to give up and not yet a rule — see below.

Spelling out digits in the lyrics file before any of this is free and removes a
known hazard.

### A note on reproducibility

Every figure in this section comes from drafts generated by the code as it
currently stands, against the audio and the lyrics as they currently stand.
The seven songs that completed "Nothing New", and the realigned "Going
Circle", were added in later batches than the rest, so there were several runs
rather than one; no timing-relevant code changed between them, and the earlier
drafts were left untouched rather than quoted from an older version. That
discipline was not observed in an earlier version of this document, and the
reason is worth recording.

One draft — "Glass Door" — had been produced months earlier and disagreed with
what the same inputs produce today: it placed the first line at 90.2 s where
the aligner now puts it at 44.6 s, the correct time. On that stale draft the
song scored 40 of 40 regions needing re-placement, and it was cited here as the
worst case in the corpus and as the clearest example of a rescue by
`--anchor`. Regenerated, it needs 15, and anchoring does not change it at all.

Regenerating all thirty drafts reproduced twenty-nine of them exactly, so
alignment on this machine is deterministic and only that one file was affected.
Its original lyrics file no longer exists, so the cause cannot be demonstrated;
the likeliest explanation is that the original run saw a different input. Both
claims that rested on it have been removed.

The lesson generalises past this document: a corpus assembled over weeks
accumulates results from different versions of the thing being measured, and
file timestamps do not reveal it — the stale draft was *newer* than its audio.
The only reliable fix is to regenerate everything before quoting anything.

A second case points the other way, and is the reason one song was realigned
late. "Going Circle" had carried a spurious extra line in its lyrics file, so
every run dutifully placed a line that was never sung and scored the result.
Regenerating drafts could not have caught that one: the fault was in the
*input*, and each run reproduced it faithfully. Comparing counts does not
catch it either, which was the first guess and the wrong one — the extra line
sat in the lyrics file *and* in the corrected SRT, 73 against 73, so the two
agreed with each other perfectly.

What does catch it is the audio. A region in a *corrected* file whose whole
span is digital silence is a line nobody ever sang there, and no amount of
careful editing produces one; entry 73 was the only such region in the album.
That check now ships as `tools/audit_corpus.py`, which reads each corrected
SRT against its lyrics and its stem:

```sh
uv run python tools/audit_corpus.py "tmp/Chapter 22"
uv run python tools/audit_corpus.py <folder> --no-audio   # counts only
```

It reports nothing on the 38 corrected files as they currently stand, and
exits non-zero when it does find something, so a corpus run can be gated on
it. The entry-count comparison is kept as the cheap first check, because it
catches the other shape of the same fault — a region appended to the SRT
without a matching lyrics line, which is how this was first noticed on
another song.

Realigned without the spurious line, "Going Circle" needs 8 regions re-placed
rather than 10 and has no collapsed run rather than one — which is why
"Chapter 22" reads 501 regions and 5 of 12 songs here, where an earlier
version of this document said 502 and 6 of 12.

Both failures were silent, both survived a check that looked sufficient, and
neither was found by reasoning about the pipeline — they were found by
comparing files that should have agreed and did not.

### What is not yet measured

Thirty-eight songs, one artist, one language, one production style, all from
2026. The
mechanism and the direction of every result here are solid within that; the
percentages are not a forecast for anyone else's material, and the three
albums demonstrate that they are not even a forecast for the next album by the
same singer.

`--anchor` has been measured on two of the three albums, but the selector's
threshold —
simply "fewer regions in silence" — is the crudest rule that works. Nothing
finer has been fitted, deliberately, given that two fitted thresholds have
already broken on fresh data.

Distance moved is also a proxy for effort rather than effort itself. Dragging
one edge 30 s and rebuilding a region from scratch are different actions even
when the numbers agree, and the editor knows which actually happened.

Two analyses here were not recomputed when the corpus grew from 31 songs to
38: the nineteen original per-song properties in [§ The variance is
unexplained](#the-variance-is-unexplained), and the block structure of
failures in [§ What actually fails: blocks of
lines](#what-actually-fails-blocks-of-lines). Both are stated over the songs
they were measured on, and seven more songs would not change their direction,
but the coefficients are not corpus-wide figures. The two pronunciation
properties added afterwards *were* measured over all 38, as was the ANOVA.
Two further checks were run against every new song: digital silence in the
stems, because that check is cheap and the cost of missing another "Bride" is
high, and `tools/audit_corpus.py` over all 38 corrected files, for the reason
given above.
### Where it still needs a person

Typical pop and rock material aligns within a couple hundred milliseconds per
line. Screamed and growled vocals, heavy vocoder or extreme autotune, and
dense overlapping vocals — choirs, call-and-response — defeat both the aligner
and the energy gate, and still need real manual work. The gate in particular
assumes one voice at a time against a quiet background; layered harmonies with
staggered entries give it no clean edge to find.

### Open questions

- **What makes the aligner drop a block.** The most important unanswered
  question here, and the probe sharpened it rather than settling it. Failures
  arrive in runs of three to ten consecutive lines, and roughly half of those
  runs begin nowhere near a silence. Nineteen measured properties fail to
  separate a song needing no work from one needing almost total re-placement,
  even when the two were recorded days apart. The next step is to ask what the
  lines *inside* a block have in common, now that they can be named.
- **Warning from the failure count during the run.** `--debug` now recovers
  which lines failed, and the count correlates 0.96 with the re-placed share —
  a stronger signal than either fingerprint the finished file carries. It is
  still only reported in the debug timeline; it could be a warning on every
  run, raised before the SRT is even written.
- **Skipping the second pass when it cannot help.** `--anchor` doubles the
  runtime on every song, but the warning signals are available from the first
  pass alone. Running the transcript pass only on songs that show a signature
  would cost nothing on the roughly half of each album that comes out clean.
- **Adaptive caps.** `--max-duration` is one constant applied to a song whose
  lines vary in length. Deriving a per-song cap from the distribution of
  trimmed region lengths, or a per-line one from syllable count, would remove
  the parameter users are most likely to have to tune.
- **Rescuing `--max-gap`.** The flag is disabled because it guesses which side
  of a silence a line belongs to. Alignment confidence scores, which stable-ts
  already returns, might turn that guess into a decision worth making — cut at
  the silence when the following words are confidently placed, hold the region
  open when they are not.
- **Extending beyond one artist.** Two albums settled the shape of the failure
  and showed how much it varies, but they are one voice, one language, one
  production style. Whether the proportions hold for anyone else is untested.
- **Weighting the buckets.** Distance moved is a proxy for effort, not effort
  itself. Recording the edit operations in player_editor rather than inferring
  them from the diff would sharpen every number in this document.

---

Defaults referenced throughout: 20 ms analysis frames, −40 dB gate relative to
peak, 120 ms edge padding, 0.2 s minimum region, 0.02 s minimum gap, 5 s
maximum region.
