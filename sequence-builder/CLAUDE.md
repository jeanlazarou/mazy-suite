# CLAUDE.md - Sequence Builder

This file provides guidance to Claude Code when working with this application.

## Purpose

Sequence Builder is a track transition tester for playlist curation. It helps users audition how tracks flow together by playing the **ending of one track** followed by the **beginning of the next track**, without loading entire files into memory.

## Commands

```bash
pnpm install        # Install dependencies (first time)
pnpm start          # Dev server (Vite, port 3000)
pnpm dev            # Same as pnpm start
pnpm build          # Production build
pnpm preview        # Preview production build
```

This is a Vite + React + TypeScript project. Vite provides instant HMR and fast builds.

## Use Case

When curating playlists, DJs and music enthusiasts need to test how tracks transition. Loading full tracks is memory-intensive and slow. This app:

1. Plays only the **first** and **last few seconds** of each track (5–15 s, set on a dial; 10 by default)
2. Lets users click tiles to build a sequence
3. Plays transitions (end of track A → beginning of track B)
4. Provides a replay mode to review the full sequence
5. Exports the tested sequence as a new playlist JSON

## Architecture

**State Management**: React useState/useEffect (simple state, no Recoil/Redux needed)

**Tech Stack**: React 18 + TypeScript + Web Audio API

**Key Files**:

- **types.ts** — TypeScript type definitions for Track, Playlist, Album, AudioSegments
- **api.ts** — Reads the suite's albums (`albums.json`, album files) and resolves track URLs
- **App.tsx** — Main container, album chooser, sequence state, what is playing (`playing`, `run`, `stopAll`), shuffle, picking, export
- **TrackGrid.tsx** — Grid of tiles in display order; in sequence order the transition arrows and the divider; the menu of runs (`TryMode`)
- **TrackTile.tsx** — Individual tile: color, sequence number, progress, its run button, source outline
- **savedSequences.ts** / **SequencesPopup.tsx** — Sequences saved by name in localStorage, per album, and the popup to save/load/delete them
- **PreviewDial.tsx** — Preview length control, an analog 15-second timer face (also defines MIN/MAX_PREVIEW)
- **SequencePlayer.ts** — Audio playback engine, manages segment loading and playback
- **AudioSegmentLoader.ts** — Loads specific time ranges using HTTP Range requests
- **App.css** — Styling with gradient background and responsive grid

## Technical Details

### Audio Segment Loading

**Current implementation** (simplified approach):

1. **Fetch entire file**: `fetch(url)` loads the complete audio file
2. **Decode**: Web Audio API's `AudioContext.decodeAudioData(arrayBuffer)`
3. **Extract segments**: Slice AudioBuffer to get first/last `MAX_PREVIEW` (15) seconds
   - Start segment: samples 0 to (sampleRate × 15)
   - End segment: samples (totalSamples - sampleRate × 15) to totalSamples
4. **Cache**: Store decoded segment AudioBuffers in Map<url, {start, end}>
5. **Trim at play time**: `play()` takes the first `previewSeconds` of a start
   segment, the last `previewSeconds` of an end segment — so changing the
   preview length is instant and never reloads anything

**Playback approach**:

1. **Convert to WAV Blob**: AudioBuffer → WAV format (PCM 16-bit)
2. **Create Blob URL**: `URL.createObjectURL(wavBlob)`
3. **HTML5 Audio element**: `new Audio(blobUrl)` for reliable playback control
4. **Cleanup**: Revoke Blob URL after playback or when stopped

This approach enables:
- Reliable `pause()` and stop functionality (unlike AudioBufferSourceNode)
- Session-based cancellation to prevent audio overlap
- Instant playback (no buffering delays since it's in-memory)

### Albums (where the tracks come from)

Like the other suite apps, the app lists the suite's albums from
`data/albums.json` (covers on the start screen, a selector in the header) —
there is no file picker: the album files' track urls point at the server's
`/music/files/`, so a playlist picked from the local disk made no sense.

`api.ts` follows twin_diff's `api.js`: it probes `./data/albums.json` once and
falls back to `../data/albums.json` (the suite's demo site, where apps live one
folder down and share `/data` and `/music`). Track urls are used as the album
writes them, as `player` does — `/music/files/...` from the server root, or
`../music/files/...` as `build_site.sh` rewrites them for the portal — only
encoded, with `encodeURI` as the player does (plus `#` and `?`): Vite's dev
server does not decode `%2C`, so `encodeURIComponent` lost every track with a
comma in its name. They are **not** rebased on the data root: on a
site laid out `/music/{player,sequence,data,files}` the data is at `../data`
but the audio is not at `../music/files`. `public/data` and
`public/music/files` are symlinks made by `../scripts/link_data.sh demo|library sequence-builder`.

The open album is kept in the URL (`#album=<name>`) so a reload reopens it.

### Saved sequence format

Same shape as an album file, so `player` can open it — `playlist`, not
`tracks`, with each track's `url` as written in the album (`Track.sourceUrl`),
not the resolved fetch URL:

```json
{
  "title": "Album Title - Sequenced",
  "playlist": [
    { "url": "/music/files/Album/Song.mp3", "title": "Track Title", "authors": ["Artist Name"] }
  ]
}
```

### Session-Based Playback Cancellation

**SequencePlayer** uses a session ID system to prevent overlapping audio:

```typescript
private currentSessionId: number = 0;

async playTransition(urlA: string, urlB: string) {
  const sessionId = ++this.currentSessionId;  // Increment session

  // Load segments...
  if (sessionId !== this.currentSessionId) return;  // Cancelled

  await this.loader.play(segmentsA.end);
  if (sessionId !== this.currentSessionId) return;  // Check again

  await this.loader.play(segmentsB.start);
}

stop() {
  this.currentSessionId++;  // Invalidate all running sessions
  this.loader.stopCurrentSource();
}
```

When `stop()` is called, it increments the session ID, causing all running async playback methods to early-return at their next check point.

### Interaction Modes

What plays is one state in App, `playing`: `'build' | 'transition' | 'replay' |
'audition'` (null when idle). Everything that plays goes through `run(kind,
fn)`, which only clears the state if no newer play replaced it; `stopAll()`
stops anything. While something plays, Replay becomes **■ Stop**; Esc stops too.
`AudioSegmentLoader.stopCurrentSource()` settles the promise of the segment it
stops, so a stopped replay or run returns (before, it hung and left Replay
disabled).

**Build Mode** (default):
- Click tile → plays its ending (the preview length, 10 s by default), adds to sequence
- Click next tile → plays previous end + new beginning (transition test)
- Clicking the last tile of the sequence undoes it, even while playing
- Tiles show sequence numbers (1, 2, 3...)
- **Shuffle** keeps the sequence as ordered and appends the tracks not in it,
  in a random order (an empty sequence: all tracks). Pressed again while the
  sequence is still what it made (`lastShuffle`), it draws the appended part
  again and keeps the same kept part; any other change makes the whole
  current sequence the kept part. A draw never repeats the current order.
  Disabled when a press could change nothing: every track is in a sequence
  you ordered, or the shuffle added a single track

**Replay Mode**:
- Click "Replay" → plays full sequence with transitions
- Currently playing tile highlights
- Track title displays at bottom
- Auto-advances through sequence

**Grid order**: a toggle (remembered, `sequence-builder:grid-order`) shows the
album's order or the sequence first, in its order, then the others. Colors
follow the album position (`DisplayedTrack.index`), so a track never changes
color. Only in sequence order: an **arrow** between each two consecutive
sequence tracks plays that one transition (lit while it plays), and a dashed
divider ends the sequence. The arrows live in the widened column gap (the one
before a row-starting tile in the left padding), not in the tiles, so tile
clicks are unchanged.

**Runs of transitions** (`'audition'`): a tile's fan button opens a menu — try
its ending into **all other tracks** or the **remaining** ones (not in the
sequence) — and `SequencePlayer.playTransitionsFrom` plays source end →
candidate start for each, in the grid's order. The source is outlined, the
candidate highlighted, the footer shows the pair, the count and **Skip**
(`skip()` moves on even mid-way through the source's ending). Clicking a tile
during a run **picks** it: it goes right after the source (which joins the
sequence first if needed), nothing replays; clicking the source only stops.

### Preview Length

The dial in the header sets how much of an ending/beginning is played, whole
seconds from 5 to 15. It is a 15-second timer face (one turn = 15 s, 12
o'clock = 0/15) with the length as a wedge and the value in the hub: drag the
hand or click the face, scroll over it, or arrow keys / Home / End
(`role="slider"`). Dragging into the unreachable 0–5 zone snaps to the nearer
end, so moving past 12 o'clock stays at 15. The value is remembered in
localStorage (`sequence-builder:preview-seconds`); it applies from the next
segment played.

### Color Generation

Tiles use HSL colors with:
- Hue: Evenly distributed across spectrum (0-360°)
- Saturation: 70% (vibrant but not oversaturated)
- Lightness: 60% (readable, not too dark or bright)

Formula: `hsl(${(index * 360 / totalTracks) % 360}, 70%, 60%)`

### Saving

- **Sequences** (popup): save the sequence under a name, load or delete saved
  ones. Kept in this browser, localStorage `sequence-builder:sequences:<album>`,
  by `sourceUrl`. Loading asks first only if the current sequence is not one of
  the saved ones; tracks no longer in the album are left out with a message.
- **Export**: downloads the sequence as an album-shaped JSON (see above),
  titled and named after the sequence's name once it has one.

## File Locations

- Albums: `public/data/albums.json` and `public/data/<name>.json` (link to the suite's `data/` or `examples/data/`)
- Audio: `public/music/files/` (link to your collection or `examples/music/files/`)

## Memory Optimization

**Why only a few seconds?**
- A 3-minute MP3 at 320kbps ≈ 7.2 MB
- A 50-track playlist ≈ 360 MB (too much!)
- 15s segments × 2 (start + end) × 50 tracks ≈ 36 MB (manageable) — cached at
  the longest preview length so the dial can change it without reloading

**Caching strategy**:
- Pre-load all segments on playlist load (for fast transitions)
- Clear cache on new playlist load
- Option to load on-demand for huge playlists (future enhancement)

## Future Enhancements

- Crossfade between transitions
- Waveform visualization of segments
- BPM detection for better matching
- Drag-and-drop reordering
- Runs of transitions *into* a track (what could come before it)
- Export to M3U/PLS formats

## Dependencies

- **React 18** — UI framework
- **Web Audio API** — Audio decoding (`AudioContext.decodeAudioData`) and AudioBuffer manipulation
- **HTML5 Audio element** — Playback control (`new Audio()`, `pause()`, `play()`)
- **Fetch API** — Loading audio files

No external audio libraries needed (wavesurfer.js, howler.js, etc.) — keep it lightweight!

## Browser Compatibility

Requires:
- Modern browser with Web Audio API support (Chrome, Firefox, Safari, Edge)
- HTML5 Audio element support (all modern browsers)
- CORS headers if loading audio from different origin
- Blob URL support (all modern browsers)

## Development Notes

- Keep it simple and fast
- Prioritize quick interactions over features
- Visual feedback is crucial (colors, highlighting, numbers)
- Audio should start playing within 100ms of click
- Avoid loading spinners if possible (pre-load everything)
