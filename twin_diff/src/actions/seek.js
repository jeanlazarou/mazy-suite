import { engine } from '../audio/engine.js';
import { useTwinStore } from '../state/store.js';
import { mapTime } from '../model/bands.js';

// Seek on the clock side.
export function seek(t) {
  if (!engine.ready()) return;
  engine.seek(t);
  useTwinStore.setState({ position: engine.position() });
}

// Seek from a click on either side: a time on the side clicked becomes a
// time on the clock side through the mapping, so clicking the silent side
// takes you to the corresponding moment rather than to its own second count.
export function seekOnSide(side, t) {
  const { layout, clock } = useTwinStore.getState();
  seek(side === clock ? t : mapTime(layout, side, clock, t));
}

export function seekHome() {
  seek(0);
}
