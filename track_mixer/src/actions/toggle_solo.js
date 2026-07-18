import { useMixStore, withLane } from '../state/store';
import { engine } from '../audio/engine';

export const toggleSolo = (trackId) => {
  useMixStore.setState((s) => withLane(s, trackId, (t) => ({ ...t, solo: !t.solo })));
  engine.modelChanged();
};
