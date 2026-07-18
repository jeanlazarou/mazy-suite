# Sequence Builder

A track transition tester for playlist curation. Test how tracks flow together by listening to endings and beginnings without loading entire files.

## Features

- 🎵 **Smart Loading**: Only loads first/last 10 seconds of each track
- 🎨 **Colorful Grid**: Visual, easy-to-navigate track display
- ▶️ **Transition Testing**: Click tracks to hear how they flow together
- 🔄 **Replay Mode**: Review your entire sequence with visual feedback
- 💾 **Export**: Save your curated sequence as a new playlist JSON

## Quick Start

```bash
pnpm install
pnpm start
# or
pnpm dev
```

Vite will automatically open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

1. **Load a Playlist**: Click "Load Playlist" and select a JSON file
2. **Build a Sequence**: Click tiles to add tracks to your sequence
   - First click: Plays the track's ending
   - Subsequent clicks: Plays transition (previous ending → new beginning)
3. **Review**: Click "Replay" to hear the full sequence with visual highlighting
4. **Save**: Export your sequence as a new playlist JSON file

## Playlist JSON Format

Compatible with the Mazy Suite Player format:

```json
{
  "title": "My Playlist",
  "tracks": [
    {
      "url": "../music/files/track.mp3",
      "title": "Track Title",
      "authors": ["Artist Name"],
      "rating": 5,
      "enabled": true
    }
  ]
}
```

## Memory Optimization

Traditional players load entire audio files (50 tracks × 7MB ≈ 350MB). Sequence Builder loads only 10-second segments (50 tracks × 0.5MB ≈ 25MB), enabling fast, smooth transitions without memory issues.

## Browser Requirements

- Modern browser with Web Audio API support
- Server must support HTTP Range requests (for future optimization)

## Part of Mazy Suite

- **Player**: Full-featured music player with lyrics, waveforms, playlists
- **Sequence Builder**: This app - transition testing and curation tool

---

Built with Vite + React 18 + TypeScript
