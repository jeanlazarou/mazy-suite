# srt_generator

Generates a **draft SRT file** with lyric timings from a song. The draft is
meant to be finished in **player_editor** — the output always passes its
strict SRT parser (sequential IDs, `from < to`, increasing timings), so even
a rough result opens cleanly and editing becomes nudge-and-accept instead of
placing every region by hand.

Part of the mazy_suite.

## How it works

- **Preferred path — forced alignment.** You provide the lyrics as a text
  file and the tool only decides *when* each line is sung, not *what* is
  sung. Far more robust on songs than transcription (stable-ts + whisper).
- **Fallback — transcription.** Without a lyrics file, whisper transcribes
  freely. Words will be rough on songs; timings are still a usable draft.
- **Full-mix mode.** With `--mix`, demucs (htdemucs) isolates the vocal stem
  first and alignment runs on that. The stem is cached in a `separated/`
  folder next to the audio, so re-runs skip separation.

## Setup

Requires [uv](https://docs.astral.sh/uv/) and ffmpeg (both via Homebrew).

```sh
uv sync
```

This creates `.venv` with Python 3.12 and all dependencies (torch is large,
first sync takes a while). The first run also downloads model weights
(whisper large-v3 ~3 GB, htdemucs ~300 MB) into `~/.cache`.

## Usage

```sh
# vocals-only audio (a clean vocal take, no separation needed)
uv run srt_generator vocals.wav lyrics.txt -o song.srt

# full mix: demucs first, then align
uv run srt_generator song.mp3 lyrics.txt -o song.srt --mix

# no lyrics available: free transcription (rough words, draft timings)
uv run srt_generator song.mp3 -o song.srt --mix
```

Useful options: `--language fr`, `--model medium` (faster, less accurate),
`--device cpu`, `--min-duration 0.3`, `--max-duration 8`.

## Silence trimming

Region edges are snapped back to the actually-voiced audio (RMS gate,
`--trim-db`, default −40 dB; `--no-trim` disables). Edges only ever
shrink — within a region the tool errs on the side of keeping audio:
dragging an edge in in player_editor takes seconds, while a region that
skipped real singing is much harder to spot and repair.

For the same reason `--max-gap SECONDS` (close a region at its first
internal silence longer than that) is **off by default and experimental**:
when the aligner slips on repeated lines it can cut on the wrong side of
a silence and drop covered singing. Prefer the duration cap below, which
cannot silently swallow a whole line.

## Region length cap

Aligners stretch a line's end towards wherever the next line starts, so
a line before an instrumental break comes out tens of seconds long.
`--max-duration` (default **5 s**, about one sung line; `0` disables)
bounds that: a region only looks for singing within the cap and closes
on the last voiced frame it finds there, falling back to a hard cut at
the cap when nothing else bounds it.

Raise it for songs with long held phrases; the cost of a cap that is
too low is a region that ends early and needs its end dragged out again
in player_editor.

## Overlaps

The final pass guarantees the timings player_editor expects: regions are
strictly ordered, never overlap (it reads one flat list of alternating
start/end timings — an overlap scrambles which line is highlighted), and
every region is at least `--min-duration` long. Overlaps are resolved by
shaving the earlier region's end, since that is the side the aligner
stretched; a start is only pushed forward when the end cannot be shaved
without collapsing the region.

## Lyrics file format

Plain text, **one line per SRT entry**, in singing order, **fully expanded**
— write the chorus out at every repetition, no `(chorus)` markers. Blank
lines are ignored.

## Notes for Apple Silicon

`--device auto` (the default) runs everything on CPU. This is deliberate:
htdemucs has a conv layer that exceeds the MPS backend's output-channel
limit (`NotImplementedError: Output channels > 65536`), and torch's
`PYTORCH_ENABLE_MPS_FALLBACK` does not rescue it — the fallback only covers
unimplemented ops, not size limits. The M-series CPU handles both models at
usable speed. `--device mps` exists if a future torch lifts the limit.

## Known limits

Screamed/growled vocals, heavy vocoder or extreme autotune, and dense
overlapping vocals (choirs, call-and-response) will still need real manual
work in player_editor. Typical pop/rock material aligns within a couple
hundred milliseconds per line.
