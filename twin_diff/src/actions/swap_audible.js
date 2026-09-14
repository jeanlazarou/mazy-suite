// Tab: hear the other side, without moving. The position crosses over
// through the band it sits in, and playback carries on there — the fastest
// way to ask "how does this bar sound in the other version".

import { engine } from '../audio/engine.js';
import { useTwinStore } from '../state/store.js';

export function swapAudible() {
  if (!engine.ready()) return;
  engine.swap();
  useTwinStore.setState({
    clock: engine.clock,
    audible: engine.audible,
    position: engine.position(),
  });
}
