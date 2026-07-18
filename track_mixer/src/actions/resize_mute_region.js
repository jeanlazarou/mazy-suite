import { useMixStore, withLane } from '../state/store';

// Called on every drag move (new-region drag or edge drag) — playback is
// resynced once, on drag end (the Lane calls engine.modelChanged()).
export const resizeMuteRegion = (trackId, regionId, start, end) => {
  useMixStore.setState((s) => withLane(s, trackId, (t) => ({
    ...t,
    regions: t.regions.map((r) => (r.id === regionId ? { ...r, start, end } : r)),
  })));
};
