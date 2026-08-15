# Lyrics Editor

A browser editor for aligning song lyrics with audio. Load a track and its SRT
subtitles, draw a region on the waveform for each verse, nudge it until it sits
exactly on the audio, and save the result back as an SRT file.

**▶ [Try it live](https://jeanlazarou.github.io/mazy-suite/player_editor/)** —
part of the [Mazy Suite](https://jeanlazarou.github.io/mazy-suite/). Everything
runs in the browser; no audio is uploaded anywhere.

The timings produced here are what [player](../player), [gig_anim](../gig_anim)
and [lyrics-cards](../lyrics-cards) read to display lyrics in sync with a track.

![Editing "Against Myself": gray regions mark the saved verse timings across the waveform, the green region at 00:00:47,212 – 00:00:49,924 is the one being edited, and the lyrics panel highlights the verse under the playhead next to the zoom, timer and jog dial](docs/screenshots/main-view.png)

## Quick start

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

With no album data installed (see [Album data](#album-data)) the sidebar is
empty — press <kbd>A</kbd> and pick an audio file and an SRT file from disk.

## Loading a song

Two ways in:

- **From disk** — <kbd>A</kbd> opens the *Load project* dialog: choose an audio
  file (`.mp3`, `.wav`) and, optionally, an `.srt` file. Without subtitles you
  start from an empty lyrics panel and type the verses in yourself.
- **From an album** — the left sidebar lists the albums found in the data
  directory. Clicking a track loads its audio and looks up
  `data/lyrics/<track title>.srt`. <kbd>Ctrl</kbd>+<kbd>O</kbd> then loads a
  different SRT file over the current track.

Lyrics are edited as plain text: the pencil icon in the lyrics panel turns the
list into a textarea, one verse per line. Verse *n* in that list owns region
*n* on the waveform, so adding or removing lines shifts the mapping.

## Editing timings

Each verse is a region on the waveform, coloured by state:

| Colour | Meaning |
| ------ | ------- |
| Gray   | Timing as it was loaded from the SRT file |
| Violet | Timing changed since loading, not yet saved |
| Green  | The active region — the one you are editing, looping while it plays |

Click a region to make it active. It loops during playback, so you can keep
hearing the same phrase while you adjust its bounds. Arrow keys move the
playback head or resize the active region; <kbd>Enter</kbd> commits the change
(the region turns violet), <kbd>Esc</kbd> reverts it to where it was.

The nudge step follows the zoom level — `(100 - zoom) / 100` seconds, so it is
roughly a second when fully zoomed out and down to milliseconds as you zoom in.
Zoom, timecode
readout, jog dial and position memory sit in the transport strip under the
lyrics panel.

Ways to create a region:

- <kbd>Insert</kbd> / <kbd>i</kbd> — a 2-second region at the playback position.
- <kbd>Ctrl</kbd>+<kbd>i</kbd> — while playing, drop a 1-second region starting
  0.25 s before the current position. This is the fast pass: play the song and
  tap once per verse, then refine.
- <kbd>Ctrl</kbd>+<kbd>d</kbd> — duplicate the active region, to move the copy
  elsewhere.

### Editor modes

The speed dial in the bottom-right corner decides what clicking a region does:

- **Edit** (blue) — select the region and edit it.
- **Split** (orange) — split the region in two at the click point (verses are
  re-numbered).
- **Delete** (red) — remove the region.

### Moving a block of timings

To re-time a whole passage — a repeated chorus, or everything after an edit to
the audio:

1. Make a region active, then press <kbd>s</kbd> to store its range in the **R**
   memory (shown bottom-left).
2. Move the playback head where that passage should now start.
3. Press <kbd>Shift</kbd>+<kbd>S</kbd>. Every timing inside the stored range
   moves by the same offset. If the stored range reaches the end of the track,
   everything from its start onwards moves.

For shifting complete files offline, see [shift_timings.rb](#shift_timingsrb).

### Checking timings

The **Timings** button (<kbd>Ctrl</kbd>+<kbd>v</kbd>) lists every verse with its
start and end, flagging any region that starts before the previous one ends. A
warning triangle appears on the waveform whenever such an overlap exists.

In the dialog you can:

- tick **Quick fix** to preview a version where each overlapping region is cut
  back to the start of the next one;
- mark individual verses for removal;
- **Apply** to write the previewed timings back into the song.

### Saving

**Save** (<kbd>Ctrl</kbd>+<kbd>s</kbd>) renders the timings as SRT and downloads
the file — nothing is written back to the server. Regions are sorted by start
time and re-numbered on the way out, and the *n*-th region takes the *n*-th line
of the lyrics panel as its text.

## Keyboard shortcuts

The keyboard icon in the bottom-left corner shows the same list in the app.
Shortcuts are inactive while the lyrics textarea has focus.

**General**

| Key | Action |
| --- | ------ |
| <kbd>A</kbd> | Load audio + subtitles from disk |
| <kbd>Ctrl</kbd>+<kbd>O</kbd> | Load a subtitles file for the current track |
| <kbd>Ctrl</kbd>+<kbd>S</kbd> | Save subtitles |
| <kbd>Ctrl</kbd>+<kbd>V</kbd> | Check timings / overlaps |
| <kbd>Ctrl</kbd>+<kbd>P</kbd> | Toggle marker labels |

**Transport**

| Key | Action |
| --- | ------ |
| <kbd>Space</kbd> | Play / pause |
| <kbd>Home</kbd> | Back to the beginning |
| <kbd>←</kbd> / <kbd>→</kbd> | Move playback position by one step |
| <kbd>Ctrl</kbd>+<kbd>M</kbd> | Memorize position (**M** memory) |
| <kbd>Ctrl</kbd>+<kbd>G</kbd> | Go to memorized position |

**Region**

| Key | Action |
| --- | ------ |
| <kbd>Insert</kbd> / <kbd>i</kbd> | Insert a region at the playback position |
| <kbd>Ctrl</kbd>+<kbd>I</kbd> | Drop a region while playing |
| <kbd>Ctrl</kbd>+<kbd>D</kbd> | Duplicate the active region |
| <kbd>Enter</kbd> | Accept the change |
| <kbd>Esc</kbd> | Cancel the change |
| <kbd>Shift</kbd>+<kbd>←</kbd> / <kbd>→</kbd> | Move the region |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Move the region end later / earlier |
| <kbd>Shift</kbd>+<kbd>↓</kbd> / <kbd>↑</kbd> | Move the region start earlier / later |
| <kbd>s</kbd> | Store the region range (**R** memory) |
| <kbd>Shift</kbd>+<kbd>S</kbd> | Shift the stored range to the playback position |

Marker labels (<kbd>Ctrl</kbd>+<kbd>P</kbd>) put a symbol — `1`…`9`, then
`A`…`Z`, cycling — on each region and beside the matching lyric line, to tell at
a glance which region belongs to which verse.

## Album data

The sidebar reads from a `data` directory served next to the app: `../data`
relative to the page, i.e. `public/data/` in development and the shared
`_site/data/` on the demo site.

```
public/
  data/
    albums.json             [{ "name": "back-to-normal", "image": "png" }, …]
    back-to-normal.json     playlist: title, period, tracks (url, title, authors, volume)
    back-to-normal.png      cover art (+ <name>-500.png for the large preview)
    lyrics/
      Big Three.srt         one SRT per track title
  music/
    files/…                 the audio the playlist urls point at
```

[examples/data](../examples/data) holds a working sample of that layout, used to
build the demo site. Audio under `public/music/` is deliberately left out of the
production build (`vite.config.js`) — the collection is gigabytes and lives on
the server; `pnpm preview` still serves it locally.

In development an extra **Test Album** appears with a single *Metronome* track
and generated timings, handy for checking region behaviour against a steady
pulse. It expects `public/music/Metronome.ogg` — a metronome file from
[this collection](https://sourceforge.net/projects/metronomeaudiofiles/)
("1400 ms (40 BPM).ogg", renamed) does the job.

## Commands

| Command | Description |
| ------- | ----------- |
| `pnpm dev` | Vite dev server on port 3000 |
| `pnpm build` | Production build into `build/` |
| `pnpm preview` | Serve the build, audio included |
| `pnpm test` | Run the Vitest suite (`pnpm test:watch` to watch) |
| `pnpm lint` | ESLint over the project |

Set `MUSIC_CACHE_DIR` before `pnpm dev` to let Vite serve a local music metadata
cache from outside the project.

## shift_timings.rb

A standalone Ruby script that shifts every timing in one or more SRT files by a
fixed offset — useful when the audio itself gained or lost a few hundred
milliseconds at the head. It needs the [clamp](https://github.com/mdub/clamp)
gem.

```bash
ruby shift_timings.rb --offset -250 "Big Three.srt"   # 250 ms earlier
ruby shift_timings.rb -o 1000 --no-backup *.srt       # 1 s later, no .bak files
```

Files are backed up next to the original unless `--no-backup` is given.

## Code layout

React 19 + [Jotai](https://jotai.org) atoms, no provider — actions are plain
functions taking `(get, set)`, wired through `useAtomCallback`.

| Path | Role |
| ---- | ---- |
| `src/App.js` | Shell: album sidebar + editor pane |
| `src/Editor.js` | Transport, command buttons, hotkey listener, dialogs |
| `src/Waveform.js` | `AudioEngine` wrapping WaveSurfer.js v7 and its Regions plugin |
| `src/Lyrics.js` | Lyrics panel, active-verse tracking, `currentSong` atom |
| `src/TimingsCheck.js` | Overlap report and quick fix |
| `src/actions/` | One file per user action |
| `src/srt_parser.js` | SRT reader, with an anomaly report |
| `src/utils.js` | Timing ↔ region conversion, timecodes, shifting |

Timings are stored as a flat array of `[seconds, index]` pairs: a verse start
carries its 1-based index, and the matching end carries `null`. `savedTimings`
holds the start times as they were loaded, which is what makes an edited region
show up violet instead of gray.
