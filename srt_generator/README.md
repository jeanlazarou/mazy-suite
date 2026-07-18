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
`--device cpu`, `--min-duration 0.3`.

## Lyrics file format

Plain text, **one line per SRT entry**, in singing order, **fully expanded**
— write the chorus out at every repetition, no `(chorus)` markers. Blank
lines are ignored.

## Notes for Apple Silicon

`--device auto` (the default) runs demucs on MPS and whisper on CPU, which
is the reliable combination. If you want to try whisper on MPS, pass
`--device mps`; if it errors, fall back to the default.

## Known limits

Screamed/growled vocals, heavy vocoder or extreme autotune, and dense
overlapping vocals (choirs, call-and-response) will still need real manual
work in player_editor. Typical pop/rock material aligns within a couple
hundred milliseconds per line.
