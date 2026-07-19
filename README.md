# Mazy Suite

**Mazy** comes from the Greek word *μαζί* (mazí) — "together". The Mazy Suite is a
set of tools built by a musician, for musicians, that work **together** around the
same music library: play your albums, time your lyrics, prompt them on stage,
animate them, mix your stems, master your tracks.

Everything is self-hosted and works on your own files — no accounts, no cloud,
no tracking. Bring your MP3s, get synchronized lyrics, live visuals and polished
mixes out.

**Live demo:** <https://jeanlazarou.github.io/mazy-suite/> — the portal and the
player, loaded with the demo album.

## The tools

### Web apps (Vite + React unless noted)

| Tool | What it does |
|---|---|
| [player](player/) | Album/playlist player: covers wall, waveforms, synchronized lyrics, custom playlists, metadata cache support |
| [player_editor](player_editor/) | Lyrics timing editor: align SRT lyrics on the audio waveform with region editing and extensive keyboard shortcuts |
| [live_prompter](live_prompter/) | Lyric prompter for live concerts: shows the verse coming up and the next ones, with waveform and lyric regions |
| [gig_anim](gig_anim/) | Renders animations from track lyrics, driven by a performance definition file — for gigs and videos |
| [track_mixer](track_mixer/) | Mixes a song's stems into a stereo mixdown by drawing level lines directly on the waveforms — no faders |
| [groove_lab](groove_lab/) | Drum + bass composition tool (TypeScript + Tone.js): generate a groove, fix it on a grid, chain sections, export MIDI |
| [massembler](massembler/) | Multi-track audio sequencer: cut clips from audio files, arrange them across tracks, play back and export |
| [sequence-builder](sequence-builder/) | Track transition tester for playlist curation: listen to endings against beginnings without loading whole files |
| [lyrics-cards](lyrics-cards/) | Browse albums and read each track's lyrics presented as cards (TypeScript) |
| [mix-mastering](mix-mastering/) | Audio mastering studio in Go: DSP chain (EQ, compression, limiting, stereo), CLI **and** a React/WebAssembly web UI |

### Desktop & command line

| Tool | What it does |
|---|---|
| [cover_ed](cover_ed/) | Desktop app (Tauri + React) to edit audio file metadata: title, authors, album, track number, artwork |
| [srt_generator](srt_generator/) | Python CLI that drafts an SRT lyrics file from a song (Demucs vocal separation + forced alignment), to be finished in player_editor |
| [music_cache_updater](music_cache_updater/) | Python CLI that maintains the JSON metadata cache (id, duration, last modified) the player uses to start fast |
| [mp3-playlist-manager](mp3-playlist-manager/) | Python CLI that writes the playlist JSON metadata into the MP3 files themselves — titles, authors, and embedded cover art |

## How the tools work together

The suite revolves around a shared **data folder** and simple, open formats:

- **audio**: your own MP3/WAV files, served under each app's `public/music/`
- **playlists/albums**: plain JSON files describing albums, tracks and covers
- **lyrics**: standard SRT subtitle files, one per track
- **metadata cache**: a JSON file with per-track id/duration/modification time

A typical flow: rip or record a song → tag it with **cover_ed** → draft its lyric
timings with **srt_generator** → fine-tune them in **player_editor** → enjoy it in
**player**, prompt it live with **live_prompter**, or turn it into visuals with
**gig_anim**.

All formats are documented in [docs/data-formats.md](docs/data-formats.md), and
a real **demo album** ships in [examples/](examples/) — three original songs
("Back to Normal", © Jean Lazarou, published here on purpose) with covers,
playlist JSON, metadata cache and synchronized SRT lyrics. Copy
`examples/data` and `examples/music` into any web app's `public/` folder and it
runs out of the box:

```bash
cd player
cp -r ../examples/data public/data
cp -r ../examples/music public/music
pnpm install && pnpm dev
```

**No other music is included** (and none can be committed by accident — the
root `.gitignore` blocks audio, lyrics and the data folder). Point the apps at
your own library the same way: fill `public/data/` and `public/music/` with
copies or symlinks to your collection.

## Getting started

Each project is self-contained with its own README. In general:

```bash
# Web apps
cd player          # or player_editor, live_prompter, ...
pnpm install
pnpm dev

# Python tools
cd srt_generator   # or music_cache_updater
uv sync
uv run srt_generator --help

# Go mastering tool
cd mix-mastering
./build.sh         # builds CLI + WASM + web UI
```

## The portal

[portal/index.html](portal/index.html) is a static launcher page for the web
apps. [scripts/build_site.sh](scripts/build_site.sh) assembles it together with
the app builds and the demo data into `_site/`, ready to serve with any static
file server — locally, from a USB key, or on your own site:

```bash
APPS="player" ./scripts/build_site.sh   # add more apps as you build them
```

On every push, a [GitHub Actions workflow](.github/workflows/pages.yml) runs
the same script and deploys the result to GitHub Pages — that's the live demo.

## Built with Claude

The two oldest tools, **player** and **player_editor**, were written by hand and
later fully modernized with [Claude](https://claude.com/claude-code) (React 19,
Vite, Jotai, MUI — and no more dead dependencies). All the other tools were
developed with Claude AI from the start, guided, reviewed and battle-tested on
real gigs by a human musician.

## License

[MIT](LICENSE) — © 2026 Jean Lazarou
