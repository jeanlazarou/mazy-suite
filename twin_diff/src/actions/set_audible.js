// Which side you hear. Picking a single side also moves the clock onto it,
// so the position always belongs to the audio that is actually playing.

import { engine } from '../audio/engine.js';
import { useTwinStore } from '../state/store.js';

export function setAudible(mode) {
  if (!engine.ready()) return;
  if (mode === 'a' || mode === 'b') {
    if (engine.clock !== mode) engine.swap();
    engine.audible = mode;
    engine.setAudible(mode);
  } else {
    engine.setAudible('both');
  }
  useTwinStore.setState({
    audible: engine.audible,
    clock: engine.clock,
    position: engine.position(),
  });
}
