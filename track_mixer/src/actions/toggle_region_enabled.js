import { useMixStore, withLane, getLane } from '../state/store';
import { engine } from '../audio/engine';
import { recordHistory } from '../state/history';

// E on the selected region switches it between muted and not muted:
// a disabled region stays visible but has no audible effect — audition
// the mix without deleting the region.
export const toggleRegionEnabled = () => {
  const s = useMixStore.getState();
  const { selection } = s;
  if (!selection?.regionId) return;
  const region = getLane(s, selection.laneId)?.regions.find((r) => r.id === selection.regionId);
  if (!region) return;
  recordHistory();
  useMixStore.setState((st) => withLane(st, selection.laneId, (t) => ({
    ...t,
    regions: t.regions.map((r) => (
      r.id === selection.regionId ? { ...r, enabled: r.enabled === false } : r
    )),
  })));
  engine.modelChanged();
};
