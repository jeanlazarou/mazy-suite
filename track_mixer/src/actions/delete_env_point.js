import { useMixStore, withLane } from '../state/store';
import { engine } from '../audio/engine';
import { recordHistory } from '../state/history';

export const deleteEnvPoint = (laneId, pointId, curve = 'env') => {
  recordHistory();
  useMixStore.setState((s) => ({
    ...withLane(s, laneId, (lane) => ({
      ...lane,
      [curve]: (lane[curve] ?? []).filter((p) => p.id !== pointId),
    })),
    selection: s.selection && s.selection.pointId === pointId ? null : s.selection,
  }));
  engine.modelChanged();
};
