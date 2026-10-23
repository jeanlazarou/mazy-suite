# Sequence Builder

A track transition tester for playlist curation. Test how tracks flow together by listening to endings and beginnings without loading entire files.

![The demo album "Back to Normal" in sequence order, preview dial at 10 s: three tracks with an arrow between each two; the arrow from 2 to 3 is lit because just that transition is playing — track 3's beginning fills its progress bar and the footer shows "▶ Born to Die"](docs/screenshots/main-view.png)

## Features

- 🎵 **Smart Loading**: Only keeps the first/last seconds of each track
- ⏱️ **Preview Length**: 5 to 15 seconds, set on a small timer dial
- 🎨 **Colorful Grid**: Visual, easy-to-navigate track display
- ▶️ **Transition Testing**: Click tracks to hear how they flow together
- 🔀 **Try Many at Once**: Hear one track's ending into every other (or every remaining) track, and pick the one you like
- ➡️ **One Transition**: In sequence order, an arrow between two tracks plays just their transition
- 🔄 **Replay Mode**: Review your entire sequence with visual feedback
- 🎲 **Shuffle**: A random order for the sequence, or for the whole album
- 📌 **Saved Sequences**: Keep sequences by name in your browser and come back to them
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

![The start screen lists the suite's albums by cover, title and track count — here the two demo albums, Back to Normal and Skip On Back](docs/screenshots/albums.png)

1. **Choose an Album**: Pick one of the suite's albums (from `data/albums.json`) on the start screen, or switch with the selector in the header
2. **Set the preview length** (optional): Drag the dial's hand, scroll over it, or use the arrow keys — 5 to 15 s, 10 by default
3. **Build a Sequence**: Click tiles to add tracks to your sequence
   - First click: Plays the track's ending
   - Subsequent clicks: Plays transition (previous ending → new beginning)
   - Click the last track again to undo it
4. **Find what comes next**: Hover a tile and click its fan button, then *All other tracks* or *Remaining tracks*: its ending plays into each candidate's beginning in turn (**Skip** moves on). Click the one you like to put it right after
5. **Order**: Switch *Order: Album / Sequence*. In sequence order, click the arrow between two tracks to hear just that transition; **Shuffle** tries a random order
6. **Review**: Click "Replay" to hear the full sequence with visual highlighting (**■ Stop** or Esc stops anything)
7. **Keep it**: *Sequences* saves it by name in this browser, to load again later; **Export** downloads it as a playlist JSON file

![A run of transitions: the first track (dashed outline) is tried into each of the others in turn; the second candidate is highlighted while its beginning plays, and the footer shows "Big Three → Against Myself · 2 / 2" with a Skip button and "Click a tile to pick it"](docs/screenshots/run.png)

## Albums

Like the other suite apps, Sequence Builder reads the suite's albums: `data/albums.json`
and one `<name>.json` per album, audio under `music/files/`. Link them into `public/` with

```bash
../scripts/link_data.sh demo sequence-builder      # the demo albums in examples/
../scripts/link_data.sh library sequence-builder   # your own collection
```

On the suite's demo site the app finds the shared `../data` and `../music` instead.

Saved sequences use the same format as an album file, so the Player can open them:

```json
{
  "title": "My Album - Sequenced",
  "playlist": [
    {
      "url": "/music/files/My Album/track.mp3",
      "title": "Track Title",
      "authors": ["Artist Name"],
      "rating": 5,
      "enabled": true
    }
  ]
}
```

## Memory Optimization

Traditional players load entire audio files (50 tracks × 7MB ≈ 350MB). Sequence Builder keeps only the first and last 15 seconds of each track (50 tracks ≈ 36MB), enabling fast, smooth transitions without memory issues.

## Browser Requirements

- Modern browser with Web Audio API support
- Server must support HTTP Range requests (for future optimization)

## Part of Mazy Suite

- **Player**: Full-featured music player with lyrics, waveforms, playlists
- **Sequence Builder**: This app - transition testing and curation tool

---

Built with Vite + React 18 + TypeScript
