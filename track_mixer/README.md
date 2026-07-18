# Track Mixer

Multitrack mixer for the Mazy Suite: mixes the stems of a song (all starting at
time 0) into a stereo mixdown by **drawing level lines directly on the
waveforms** — no faders.

- [SPECIFICATION.md](SPECIFICATION.md) — full specification: concepts, UI,
  audio engine, mix document format, suite integration, milestones.
- [sketch/index.html](sketch/index.html) — self-contained prototype of the core
  interaction. Open it directly in a browser (no server, no build); it
  synthesizes three demo stems so it works with zero setup. Try:
  - click a waveform's yellow line to add points and drag them,
  - shift+drag to create a mute region, then 1/2/3 for fade speed,
  - S/M to solo/mute, B to A/B-bypass the mix, Space to play,
  - "Export WAV" to render the mixdown in the browser.

Pipeline position in the suite:

```
stems → track_mixer → mixdown (WAV) → mix-mastering → player
```

Status: specification + sketch. Implementation not started (see milestones in
the specification).
