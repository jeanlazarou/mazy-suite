import { useMixStore, withLane } from '../state/store';
import { engine } from '../audio/engine';
import { recordHistory } from '../state/history';

export const deleteRegion = (trackId, regionId) => {
  recordHistory();
  useMixStore.setState((s) => ({
    ...withLane(s, trackId, (t) => ({
      ...t,
      regions: t.regions.filter((r) => r.id !== regionId),
    })),
    selection: s.selection && s.selection.regionId === regionId ? null : s.selection,
  }));
  engine.modelChanged();
};
