import { useMixStore, withLane, getLane } from '../state/store';
import { engine } from '../audio/engine';
import { REGION_MODES } from '../model/envelope';
import { recordHistory } from '../state/history';

// T on the selected region cycles its type: mute → fade-in → fade-out.
export const cycleRegionType = () => {
  const s = useMixStore.getState();
  const { selection } = s;
  if (!selection?.regionId) return;
  const region = getLane(s, selection.laneId)?.regions.find((r) => r.id === selection.regionId);
  if (!region) return;
  const mode = REGION_MODES[(REGION_MODES.indexOf(region.mode ?? 'mute') + 1) % REGION_MODES.length];
  recordHistory();
  useMixStore.setState((st) => withLane(st, selection.laneId, (t) => ({
    ...t,
    regions: t.regions.map((r) => (r.id === selection.regionId ? { ...r, mode } : r)),
  })));
  engine.modelChanged();
};
