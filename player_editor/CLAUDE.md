# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Build and Run:**
- `pnpm dev` - Start Vite development server with hot reload
- `pnpm build` - Create production build
- `pnpm preview` - Preview production build locally

**Development Environment:**
- Based on Vite with React 19
- Uses pnpm for dependency management (pnpm-lock.yaml present)
- ES modules enabled (`"type": "module"` in package.json)
- JSX support configured in .js files via Vite config

## Architecture Overview

This is a **React-based audio/lyrics editor** for synchronizing lyrics with audio tracks, part of the larger "mazy_suite" project.

**Core Technologies:**
- React 19 with functional components and hooks
- Jotai for state management (atoms and derived atoms)
- WaveSurfer.js v7.12.1 for audio waveform visualization and playback
- MUI (Material UI) for components
- SRT file parsing for subtitle/lyrics import

**State Management Architecture:**
The app uses Jotai atoms for global state (provider-less default store; actions receive `(get, set)` via `useAtomCallback`):
- `currentTrack` - Selected audio track
- `audioEngine` - WaveSurfer instance wrapper
- `audioState` - Playback status (playing/paused/stopped)
- `audioPosition` - Current playback position
- `currentSong` - Lyrics data with timings
- `visibleMarkers` - Toggle for timeline markers

**Main Components:**
- `App.js` - Root component with sidebar navigation
- `Editor.js` - Main editor interface with transport controls
- `Waveform.js` - Audio visualization using WaveSurfer.js
- `Lyrics.js` - Lyrics display and editing
- `AlbumsList.js` - Track selection sidebar

**Audio Engine (Waveform.js):**
- Wraps WaveSurfer.js v7 in an `AudioEngine` class
- Uses only the Regions plugin (Markers plugin removed in v7)
- Region-based system for lyric timing visualization:
  - **Gray regions**: Saved/unchanged lyric timings
  - **Violet regions**: Changed but unsaved lyric timings  
  - **Green region**: Currently active/selected region being edited (with looping)
- Supports both file upload and URL-based audio loading

**Actions System:**
All user interactions are handled through action functions in `src/actions/`:
- File operations: `open_files_request.js`, `save_request.js`
- Region manipulation: `add_region.js`, `select_region.js`, `accept_region.js`
- Playback control: `toggle_play.js`, position movement actions
- Memory functions: `memorize_position.js`, `goto_memorized_position.js`

**Hotkeys System (`HotkeysMapping.js`):**
Extensive keyboard shortcuts for efficient editing:
- Space: Play/pause
- Ctrl+S: Save
- Ctrl+O: Open files
- Ctrl+V: Check timings
- Arrow keys: Navigate regions/playback (with Shift modifiers)
- Insert: Add region
- Enter: Accept region changes
- Escape: Dismiss region

**Data Format:**
- Audio tracks loaded from JSON playlists (`api.js`)
- Lyrics stored as SRT subtitle files
- Timing data stored as `[timestamp, lyricIndex]` tuples
- Support for test data in development mode

**File Structure:**
- `src/api.js` - Data loading and playlist management
- `src/srt_parser.js` - SRT subtitle file parsing
- `src/utils.js` - Utility functions for markers and timing
- `public/data/` - Static audio and playlist files
- `test/` - SRT test files for validation