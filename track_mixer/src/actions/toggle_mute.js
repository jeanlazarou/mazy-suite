import { useMixStore, withLane } from '../state/store';
import { engine } from '../audio/engine';
import { recordHistory } from '../state/history';

// Mute is part of the mix document, so it is undoable (solo is only
// a monitoring state and is not).
export const toggleMute = (trackId) => {
  recordHistory();
  useMixStore.setState((s) => withLane(s, trackId, (t) => ({ ...t, mute: !t.mute })));
  engine.modelChanged();
};
