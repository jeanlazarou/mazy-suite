// Joining two touching segments of the same kind into one — typically after
// marking a song in small steps with Shift+click and finding three `same`
// stretches in a row that are really one.

import { useTwinStore } from '../state/store.js';
import { mergeNeighbour, mergeSegments } from '../model/edits.js';
import { applySegments } from './apply_segments.js';
import { selectSegment } from './select_band.js';
import { showToast } from './show_toast.js';

export function mergeWith(segmentIndex, otherIndex) {
  const { doc } = useTwinStore.getState();
  if (!doc) return;
  const segments = mergeSegments(doc.segments, segmentIndex, otherIndex);
  if (segments === doc.segments) return;
  applySegments(segments);
  selectSegment(Math.min(segmentIndex, otherIndex), { go: false });
  showToast('joined — Ctrl+Z to split them again');
}

// `j`: the selected segment joins the touching one below it, or failing that
// the one above.
export function mergeSelected() {
  const { doc, layout, selected } = useTwinStore.getState();
  const band = selected === null ? null : layout[selected];
  if (!doc || !band || band.segment === null) {
    showToast('select a segment first');
    return;
  }
  const below = mergeNeighbour(doc.segments, band.segment, 1);
  const other = below >= 0 ? below : mergeNeighbour(doc.segments, band.segment, -1);
  if (other < 0) {
    showToast('nothing to join — it needs a touching neighbour of the same kind');
    return;
  }
  mergeWith(band.segment, other);
}
