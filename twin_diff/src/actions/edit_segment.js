// Editing the selected band: its kind, its edges, or dropping it back to an
// unclassified gap (its label and note are in edit_text.js). A band that is
// not a segment (an `unknown` gap) has nothing to edit — the message says so
// rather than doing nothing.

import { useTwinStore } from '../state/store.js';
import { toggleKind, removeSegment, resizeSegment } from '../model/edits.js';
import { applySegments } from './apply_segments.js';
import { snap } from './snap_edge.js';
import { showToast } from './show_toast.js';

function selectedSegment() {
  const { doc, layout, selected } = useTwinStore.getState();
  if (!doc || selected === null) return null;
  const band = layout[selected];
  if (!band || band.segment === null) return null;
  return { doc, index: band.segment, band };
}

export function cycleKind() {
  const current = selectedSegment();
  if (!current) {
    showToast('select a segment first (a classified band, not a gap)');
    return;
  }
  const next = toggleKind(current.doc.segments, current.index);
  if (next === current.doc.segments) {
    showToast('only same ↔ changed can be toggled');
    return;
  }
  applySegments(next);
}

export function dropSegment() {
  const current = selectedSegment();
  if (!current) return;
  applySegments(removeSegment(current.doc.segments, current.index));
  useTwinStore.setState({ selected: null });
  showToast('back to an unclassified gap');
}

// Dragging a band edge. `history` is false while the pointer moves and true
// on the gesture that starts it, so one drag is one undo step.
export function resizeEdge(bandIndex, side, edge, t, { history = false } = {}) {
  const { doc, layout, durations } = useTwinStore.getState();
  const band = layout[bandIndex];
  if (!doc || !band || band.segment === null) return;
  // The segment being resized is ignored by the magnet: its own edges are
  // what is moving, so sticking to them would pin it in place.
  const { time } = snap(side, t, { ignoreSegment: band.segment });
  applySegments(resizeSegment(doc.segments, band.segment, side, edge, time, durations[side]), {
    history,
  });
}
