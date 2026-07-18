import { useMixStore, withLane } from '../state/store';
import { engine } from '../audio/engine';
import { recordHistory } from '../state/history';
import { uid } from './ids';

// Adds a breakpoint to a lane's gain line — or, with curve 'pan', to a
// track's pan line (v in -1..1). The new point becomes the selection.
export const addEnvPoint = (laneId, t, v, curve = 'env') => {
  recordHistory();
  const id = uid('pt');
  useMixStore.setState((s) => ({
    ...withLane(s, laneId, (lane) => ({
      ...lane,
      [curve]: [...(lane[curve] ?? []), { id, t, v }].sort((a, b) => a.t - b.t),
    })),
    selection: { laneId, pointId: id, curve },
  }));
  engine.modelChanged();
  return id;
};
