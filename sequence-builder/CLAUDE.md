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

1. Loads only the **first 10 seconds** and **last 10 seconds** of each track
2. Lets users click tiles to build a sequence
3. Plays transitions (end of track A → beginning of track B)
4. Provides a replay mode to review the full sequence
5. Exports the tested sequence as a new playlist JSON

## Architecture

**State Management**: React useState/useEffect (simple state, no Recoil/Redux needed)

**Tech Stack**: React 18 + TypeScript + Web Audio API

**Key Files**:

- **types.ts** — TypeScript type definitions for Track, Playlist, AudioSegments
- **App.tsx** — Main container, manages sequence state, handles playlist loading/saving
- **TrackGrid.tsx** — Grid display of colored tiles with hover titles
- **TrackTile.tsx** — Individual tile component with color, sequence number, hover state
- **SequencePlayer.ts** — Audio playback engine, manages segment loading and playback
- **AudioSegmentLoader.ts** — Loads specific time ranges using HTTP Range requests
- **App.css** — Styling with gradient background and responsive grid

## Technical Details

### Audio Segment Loading

**Current implementation** (simplified approach):

1. **Fetch entire file**: `fetch(url)` loads the complete audio file
2. **Decode**: Web Audio API's `AudioContext.decodeAudioData(arrayBuffer)`
3. **Extract segments**: Slice AudioBuffer to get first/last 10 seconds
   - Start segment: samples 0 to (sampleRate × 10)
   - End segment: samples (totalSamples - sampleRate × 10) to totalSamples
4. **Cache**: Store decoded segment AudioBuffers in Map<url, {start, end}>

**Playback approach**:

1. **Convert to WAV Blob**: AudioBuffer → WAV format (PCM 16-bit)
2. **Create Blob URL**: `URL.createObjectURL(wavBlob)`
3. **HTML5 Audio element**: `new Audio(blobUrl)` for reliable playback control
4. **Cleanup**: Revoke Blob URL after playback or when stopped

This approach enables:
- Reliable `pause()` and stop functionality (unlike AudioBufferSourceNode)
- Session-based cancellation to prevent audio overlap
- Instant playback (no buffering delays since it's in-memory)

### Playlist JSON Format

Compatible with the `player` app format:

```json
{
  "title": "Playlist Name",
  "tracks": [
    {
      "url": "relative/path/to/file.mp3",
      "title": "Track Title",
      "authors": ["Artist Name"],
      "rating": 5,
      "enabled": true
    }
  ]
}
```

Audio files are resolved relative to the playlist JSON location (typically `../music/files/`).

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

**Build Mode** (default):
- Click tile → plays last 10s, adds to sequence
- Click next tile → plays previous end + new beginning (transition test)
- Tiles show sequence numbers (1, 2, 3...)

**Replay Mode**:
- Click "Replay" → plays full sequence with transitions
- Currently playing tile highlights
- Track title displays at bottom
- Auto-advances through sequence

### Color Generation

Tiles use HSL colors with:
- Hue: Evenly distributed across spectrum (0-360°)
- Saturation: 70% (vibrant but not oversaturated)
- Lightness: 60% (readable, not too dark or bright)

Formula: `hsl(${(index * 360 / totalTracks) % 360}, 70%, 60%)`

### Saving

Export formats:
1. **Ordered playlist JSON** — New JSON file with tracks in sequence order
2. **Sequence metadata** — Track indices/URLs for later reference

## File Locations

Example playlist JSON files:
- `<your music site>/data/default.json`
- `player/public/data/<album>.json` (playlists from the suite's player app)

Audio files: typically `../music/files/` relative to playlist JSON

## Memory Optimization

**Why only 10 seconds?**
- A 3-minute MP3 at 320kbps ≈ 7.2 MB
- A 50-track playlist ≈ 360 MB (too much!)
- 10s segments × 2 (start + end) × 50 tracks ≈ 24 MB (manageable)

**Caching strategy**:
- Pre-load all segments on playlist load (for fast transitions)
- Clear cache on new playlist load
- Option to load on-demand for huge playlists (future enhancement)

## Future Enhancements

- Adjustable segment duration (5s, 10s, 15s)
- Crossfade between transitions
- Waveform visualization of segments
- BPM detection for better matching
- Drag-and-drop reordering
- Multiple sequence slots (A/B comparison)
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
