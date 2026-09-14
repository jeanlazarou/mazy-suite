// Making a correspondence. Drag a range on one side, then drag the range it
// corresponds to on the other: the first drag is held as `pending`, the
// second pairs them. Two ranges paired is a `same` segment — `c` makes it
// `changed` — which keeps the gesture free of any decision about *how* the
// two differ.

import { useTwinStore } from '../state/store.js';
import { clampToFree, addPair, addOneSided, fitsDocument } from '../model/edits.js';
import { applySegments } from './apply_segments.js';
import { snapRange, rangeFromClick } from './snap_edge.js';
import { selectSegment } from './select_band.js';
import { showToast } from './show_toast.js';

export function takeRange(side, edges) {
  const { doc, durations, pending } = useTwinStore.getState();
  if (!doc) return;

  const [from, to] = snapRange(side, edges);
  const range = clampToFree(doc.segments, side, [from, to], durations[side]);
  if (!range) {
    showToast('that stretch is already classified');
    return;
  }

  // Nothing waiting, or waiting on the same side: this becomes the pending
  // half (a second drag on the same side replaces it, which is how you fix a
  // sloppy one).
  // The bar above the strips (PendingBar) says what can happen next, with a
  // button for each, so there is no toast to catch here.
  if (!pending || pending.side === side) {
    useTwinStore.setState({ pending: { side, range }, toast: null });
    return;
  }

  const a = side === 'a' ? range : pending.range;
  const b = side === 'b' ? range : pending.range;
  // Each stretch is free on its own side; the pair must also not cross an
  // existing correspondence. The pending stretch stays, to try again.
  if (!fitsDocument(doc.segments, { kind: 'same', a, b })) {
    showToast('that pairing would cross a segment already marked between them');
    return;
  }
  const segments = addPair(doc.segments, a, b);
  applySegments(segments);
  useTwinStore.setState({ pending: null });
  selectSegment(segments.findIndex((segment) => segment.a === a && segment.b === b), { go: false });
  showToast('paired — c makes it "changed", n adds a note');
}

// The pending stretch has no counterpart. Its kind follows from its side — a
// stretch only B has was added, one only A has was removed — so there is no
// letter to get wrong: `a` and `r` both mean "one side only". Refusing the
// "wrong" letter only made the one-sided path look like it did not exist.
export function markOneSided() {
  const { doc, pending } = useTwinStore.getState();
  if (!doc) return;
  if (!pending) {
    showToast('take a stretch first — drag, or Shift+click, on one side');
    return;
  }
  const expected = pending.side === 'a' ? 'removed' : 'added';
  const segments = addOneSided(doc.segments, pending.side, pending.range);
  applySegments(segments);
  useTwinStore.setState({ pending: null });
  selectSegment(
    segments.findIndex((segment) => (pending.side === 'a' ? segment.a : segment.b) === pending.range),
    { go: false },
  );
  showToast(`marked ${expected} — only in ${doc.sides[pending.side].label}`);
}

// Taking a stretch with one click instead of a drag: the click gives one
// edge, the region already marked before it gives the other. Reaching back is
// the common case — you hear the change and click — and `forward` claims the
// rest of the gap instead.
export function takeToBoundary(side, t, reach = 'back') {
  const range = rangeFromClick(side, t, reach);
  if (!range) {
    showToast(reach === 'back' ? 'nothing marked above to reach back to' : 'nothing below to reach');
    return;
  }
  takeRange(side, range);
}

export function clearPending() {
  if (useTwinStore.getState().pending) useTwinStore.setState({ pending: null });
}
