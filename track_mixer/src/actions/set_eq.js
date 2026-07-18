import { useMixStore, withLane } from '../state/store';
import { engine } from '../audio/engine';

const clampDb = (x) => Math.max(-12, Math.min(12, x));

// Called on every slider move — adjusts the live filter directly, no source
// restart. History is recorded once per gesture by the slider component.
export const setEq = (trackId, band, db) => {
  useMixStore.setState((s) => withLane(s, trackId, (t) => ({
    ...t,
    eq: { ...t.eq, [band]: clampDb(db) },
  })));
  engine.updateEq(trackId);
};
