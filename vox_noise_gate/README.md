# Vox Noise Gate

A browser tool that silences the noise between the phrases of a vocal
recording. Open a take, and the quiet stretches (room tone, hiss, rumble) are
found and marked on the waveform. Listen, adjust what needs adjusting, and export
a clean WAV. It does in one pass what used to take a session of selecting
silences by hand, and it is a noise gate that can look ahead, because the whole
take is there.

Part of the [Mazy Suite](../README.md). Everything runs in the browser; no audio
is uploaded anywhere.

![Gating "Empty Room": red regions silenced by the gate and blue keep zones given back by hand across the vocal waveform, the green region at 01:38.263 – 01:38.970 (708 ms) being edited, the settings with the threshold at -43.5 dB above a -57 dB noise floor, 31 regions silencing 56% of the take, and the level meter with its green gate LED under the timer, next to the jog dial](docs/screenshots/main-view.png)

## Quick start

```bash
pnpm install
pnpm dev        # http://localhost:3000
```

Drop a recording on the page, or press <kbd>A</kbd>.

## What gets silenced

The gate measures the level of the recording every millisecond (RMS over 10 ms)
and calls *silence* any stretch quieter than the threshold. Each silence long
enough becomes a **region**, a stretch that ends up silent:

| Setting | What it does | Default |
| ------- | ------------ | ------- |
| Threshold | Quieter than this is silence | set from the take |
| Min silence | Shorter silences, like the gaps between words, are left as they are | 300 ms |
| Keep before voice | Audio kept before the voice comes back, for breaths and soft consonants | 40 ms |
| Keep after voice | Audio kept after the voice stops, for word endings and room tails | 150 ms |
| Fades | Fade at each end of a region | 20 ms |
| Reduce to | Silence, or the noise only turned down (-40 … -12 dB) to keep some room tone | Silence |
| Ignore lows below | The gate does not listen to rumble below this; the audio is not filtered | 80 Hz |

The fades happen **inside** the regions: everything outside them is the
recording sample for sample, and a region touching the start or the end of the
take is silent right to the edge. A region drawn by hand around a click
should therefore leave a little room before and after it.

When a take is opened, the threshold is set between its noise floor and its
voice level (shown under the sliders); the magic wand sets it again. The other
settings are remembered from one session to the next: the same microphone in
the same room keeps the same settings.

**Level view** (<kbd>V</kbd>) replaces the waveform with the level the gate
listens to, on a dB scale, with the threshold drawn across it. Room noise that
is invisible on the waveform shows there, and wherever the level dips under the
dashed lines, the gate hears silence.

## Checking and editing the regions

| Colour | Meaning |
| ------ | ------- |
| Red    | Silenced by the gate |
| Violet | Silenced by hand |
| Blue   | *keep*: left alone by hand, the gate cannot silence it |
| Green  | The region being edited |

The quickest review: press <kbd>N</kbd> to jump to the next region. It is
selected, and the playback is placed a second before it. Press
<kbd>Space</kbd> and it loops with a second of audio either side, so you hear
the voice stop, the silence, and the voice come back. Then:

- <kbd>Shift</kbd>+<kbd>↑</kbd> / <kbd>↓</kbd> moves its start, <kbd>↑</kbd> /
  <kbd>↓</kbd> its end, <kbd>S</kbd> / <kbd>E</kbd> put them at the playback
  position. The step follows the zoom: a quarter of a second zoomed out, down to
  5 ms zoomed in.
- <kbd>Enter</kbd> keeps the change, <kbd>Esc</kbd> cancels it. Moving on to
  another region keeps it too.
- <kbd>Delete</kbd> gives the audio back: the region becomes a *keep* zone.

Shrinking or moving a region turns the part it gives back into a *keep* zone
as well. Hand edits survive any change of the settings: move the threshold
after editing, and the gate works around them. **Reset**, next to the count of
hand edits, forgets them all.

With the mouse, the speed dial in the bottom-right corner sets what a click does:

- **Edit** (blue): click a region to edit it, or drag across the waveform to
  draw a new one (a breath, a click, a chair creak the gate let through).
- **Split** (orange): click a region to cut it in two.
- **Delete** (red): click a region to keep its audio, or click a *keep* zone to
  give it back to the gate.

## Listening

| Button | Key | What plays |
| ------ | --- | ---------- |
| Gated | | The result |
| Original | <kbd>B</kbd> | The recording as it is (bypass) |
| Removed | <kbd>R</kbd> | Only what the gate takes away: there should be no voice in it |

What plays is rendered by the same code as the export, so the preview is what
you get. The LED by the meter is green while the voice goes through and red
while the gate is closed; the meter shows the level the gate hears, with the
threshold in orange.

## Exporting

**Export** (<kbd>Ctrl</kbd>+<kbd>S</kbd>) downloads `<name> (gated).wav` as
16-bit, 24-bit or 32-bit float. It defaults to the format the take was recorded
in, at its sample rate. WAV files are read sample for sample, so
a 24-bit take exported in 24 bits is bit-identical wherever the gate did not
touch it.

Other formats (MP3, FLAC, M4A…) go through the browser's decoder, which
delivers them at the sound card's sample rate.

## Keyboard shortcuts

The keyboard icon in the bottom-left corner shows the same list in the app.

**General**

| Key | Action |
| --- | ------ |
| <kbd>A</kbd> | Open a recording |
| <kbd>Ctrl</kbd>+<kbd>S</kbd> | Export the cleaned WAV |
| <kbd>B</kbd> | Bypass: hear the original |
| <kbd>R</kbd> | Hear only what is removed |
| <kbd>V</kbd> | Waveform / level view |

**Transport**

| Key | Action |
| --- | ------ |
| <kbd>Space</kbd> | Play / pause |
| <kbd>Home</kbd> | Back to the beginning |
| <kbd>←</kbd> / <kbd>→</kbd> | Move playback position by one step |
| <kbd>Ctrl</kbd>+<kbd>M</kbd> | Memorize position |
| <kbd>Ctrl</kbd>+<kbd>G</kbd> | Go to memorized position |

**Region**

| Key | Action |
| --- | ------ |
| <kbd>N</kbd> / <kbd>P</kbd> | Next / previous region |
| <kbd>Insert</kbd> / <kbd>I</kbd> | New region at the playback position |
| <kbd>Enter</kbd> | Keep the change |
| <kbd>Esc</kbd> | Cancel the change |
| <kbd>Delete</kbd> / <kbd>Backspace</kbd> | Delete the region: keep its audio |
| <kbd>Shift</kbd>+<kbd>←</kbd> / <kbd>→</kbd> | Move the region |
| <kbd>↑</kbd> / <kbd>↓</kbd> | Move the region end later / earlier |
| <kbd>Shift</kbd>+<kbd>↓</kbd> / <kbd>↑</kbd> | Move the region start earlier / later |
| <kbd>S</kbd> | Start the region at the playback position |
| <kbd>End</kbd> / <kbd>E</kbd> | End the region at the playback position |

## Commands

| Command | Description |
| ------- | ----------- |
| `pnpm dev` | Vite dev server on port 3000 |
| `pnpm build` | Production build into `build/`, for any static file server |
| `pnpm preview` | Serve the build |
| `pnpm test` | Run the Vitest suite (`pnpm test:watch` to watch) |
| `pnpm lint` | ESLint over the project |

## Code layout

Built like [player_editor](../player_editor): React 19,
[Jotai](https://jotai.org) atoms without a provider, actions as plain functions
taking `(get, set)`, MUI, and WaveSurfer.js v7 with its Regions plugin.

| Path | Role |
| ---- | ---- |
| `src/core/` | The gate itself, free of the browser: WAV reading and writing, level analysis, silence detection, rendering, the region edits |
| `src/Editor.js` | Page layout, commands, hotkeys listener, file opening and drag and drop |
| `src/Waveform.js` | `AudioEngine`: WaveSurfer, the regions drawn on it, the preview rendering |
| `src/GatePlayer.js` | WaveSurfer's Web Audio player, playing the buffer the gate renders |
| `src/GateSettings.js` | Settings panel and the gate atoms (params, analysis, edits, regions) |
| `src/LevelMeter.js` | Level at the playhead and the gate LED |
| `src/actions/` | One file per user action |
| `src/HotkeysMapping.js` | Keyboard shortcuts |
