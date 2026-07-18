# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Live Prompter is a web-based lyric prompter for live concerts. It displays lyrics synchronized with audio playback, with waveform visualization and lyric region highlighting.

## Commands

- `npm run dev` — Start Vite dev server
- `npm run build` — Production build (output to `dist/`)
- `npm run lint` — Run ESLint
- `npm run preview` — Preview production build

No test framework is configured.

## Architecture

**Stack:** React 18 + TypeScript + Vite + Tailwind CSS + wavesurfer.js

**Data flow:**
1. App loads `/data/albums.json` → list of albums
2. Album selection loads `/data/{albumName}.json` → track metadata (playlist, hidden tracks)
3. Track selection loads audio from `track.url` and lyrics from `/data/lyrics/{trackTitle}.srt`
4. SRT files are parsed into timed `LyricLine` objects (`srtParser.ts`)
5. WaveSurfer renders waveform with lyric regions; `LyricDisplay` shows current + upcoming lyrics

**Key hooks:**
- `useAudioPlayer` — Wraps WaveSurfer instance, manages playback state, volume, regions
- `useLyrics` — Fetches/parses SRT files, provides `getCurrentLyric()` and `getUpcomingLyrics()`
- `useWaveform` — Initializes WaveSurfer in a container element

**Component hierarchy:**
```
App (state: albums, selected album/track, playback)
├── Sidebar (collapsible album/track navigation)
├── Waveform (audio visualization with click-to-seek)
├── PlayerControls (play/pause/stop/prev/next, volume slider)
└── LyricDisplay (current lyric + upcoming queue with countdown timers)
```

**Keyboard shortcuts** (defined in `App.tsx`): Space = play/pause, ← = previous track, → = next track.

## Data Files

Public data is symlinked: `/public/data` → the suite's shared `data/` folder. Audio files are in `/public/music`. Vite serves these with `fs.strict: false`.

**Album JSON format:**
```json
{
  "title": "Album Title",
  "playlist": [
    { "url": "/music/file.mp3", "title": "Song", "authors": ["Artist"], "volume": 85, "rating": 3 }
  ],
  "hidden": []
}
```

**Lyrics:** Standard SRT subtitle format (`HH:MM:SS,mmm --> HH:MM:SS,mmm`), stored as `/data/lyrics/{trackTitle}.srt`. Track titles with trailing `*` or `+` are stripped before filename lookup.

## State Management

React hooks only (useState, useEffect, useCallback, useRef). No external state library. App.tsx holds global state; hooks encapsulate domain logic.
