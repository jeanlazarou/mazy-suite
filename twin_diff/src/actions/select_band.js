// Selecting a band and stepping through them. A band is the unit of reading
// here, the way a hunk is in a text diff.

import { useTwinStore } from '../state/store.js';
import { seek } from './seek.js';

export function selectBand(index, { go = true } = {}) {
  const { layout, clock } = useTwinStore.getState();
  const band = layout[index];
  if (!band) return;
  useTwinStore.setState({ selected: index });
  if (!go) return;
  const range = clock === 'a' ? band.a : band.b;
  // A band with nothing on the clock side (the far end of an added/removed
  // pair) still has a place in time: where that side waits.
  seek(range[0]);
  useTwinStore.setState({ reveal: { side: clock, t: range[0] } });
}

// Select a band by the segment it carries, so an edit that has just created
// a segment can leave it selected and `c` / `n` / `l` have a target without
// the user hunting for it in the list.
export function selectSegment(segmentIndex, options) {
  const { layout } = useTwinStore.getState();
  const index = layout.findIndex((band) => band.segment === segmentIndex);
  if (index >= 0) selectBand(index, options);
}

export function stepBand(delta) {
  const { layout, selected } = useTwinStore.getState();
  if (!layout.length) return;
  const next = selected === null ? (delta > 0 ? 0 : layout.length - 1) : selected + delta;
  selectBand(Math.min(Math.max(next, 0), layout.length - 1));
}
