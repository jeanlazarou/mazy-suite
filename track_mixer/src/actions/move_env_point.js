import { useMixStore, withLane } from '../state/store';

// Called on every drag move — playback is resynced once, on drag end
// (the Lane calls engine.modelChanged() on pointer-up).
export const moveEnvPoint = (laneId, pointId, t, v, curve = 'env') => {
  useMixStore.setState((s) => withLane(s, laneId, (lane) => ({
    ...lane,
    [curve]: (lane[curve] ?? [])
      .map((p) => (p.id === pointId ? { ...p, t, v } : p))
      .sort((a, b) => a.t - b.t),
  })));
};
