// State shape and selectors only — no actions (track_mixer convention).
// Actions live in src/actions/ and write through useTwinStore.setState().

import { create } from 'zustand';
import { buildBands, layoutBands, layoutHeight } from '../model/bands.js';

export const DEFAULT_PX_PER_SEC = 14;

export const useTwinStore = create(() => ({
  doc: null, // the parsed twin document
  problems: [], // what was wrong with it, shown to the user
  status: 'empty', // empty | loading | ready | error
  error: null,

  durations: { a: 0, b: 0 },
  peaks: { a: null, b: null },
  lyrics: { a: null, b: null }, // { cues, problems, source } per side
  wordMarks: null, // each cue's words marked against the other side — both sides needed
  showLyrics: true,
  waveScale: { rms: 1, peak: 1 }, // shared by both sides, so loudness stays comparable

  layout: [], // bands with top/height, see model/bands.js
  pxPerSec: DEFAULT_PX_PER_SEC,
  layoutMode: 'true', // 'true' draws each side at its own length, 'aligned' stretches
  scrollDriver: 'a', // in true scale, the side whose song the scroll moves through
  magnet: true, // edges stick to boundaries, the playhead and quiet moments

  clock: 'a', // the side whose timeline the position lives on
  audible: 'a', // a | b | both
  playing: false,
  position: 0, // seconds on the clock side
  follow: true, // scroll with the playheads

  selected: null, // index into layout
  reveal: null, // { side, t } — a moment the view should scroll to
  twins: [], // twins.json entries
  twinsError: null,

  // authoring
  file: null, // where the document was opened from, under data/twins/
  localCopy: null, // { savedAt } when the open version is the one saved in this browser
  dirty: false,
  pending: null, // { side, range } — one half of a correspondence, waiting for the other
  editing: null, // { field: 'label' | 'note', segment, value } — the text dialog is open
  past: [],
  future: [],
  toast: null,
}));

// The layout is derived state, rebuilt whenever the document, the durations
// or the zoom change. Kept in the store rather than recomputed per render:
// every component and every hotkey reads it.
export function refreshLayout() {
  const { doc, durations, pxPerSec } = useTwinStore.getState();
  if (!doc) {
    useTwinStore.setState({ layout: [] });
    return [];
  }
  const bands = buildBands(doc.segments, durations.a, durations.b);
  const layout = layoutBands(bands, pxPerSec);
  useTwinStore.setState({ layout });
  return layout;
}

export const totalHeight = (layout) => layoutHeight(layout);

export const sideOf = (doc, side) => doc?.sides?.[side] ?? null;

export const otherSide = (side) => (side === 'a' ? 'b' : 'a');
