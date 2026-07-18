import { useMixStore, withLane, getLane, selectTotalDuration } from '../state/store';
import { engine } from '../audio/engine';
import { recordHistory } from '../state/history';

const FINE = 0.01; // s per arrow press
const COARSE = 0.1; // s with Shift

// ←/→ moves the selected region or breakpoint in time.
export const nudgeSelection = (direction, coarse = false) => {
  const s = useMixStore.getState();
  const { selection } = s;
  if (!selection) return;
  const delta = direction * (coarse ? COARSE : FINE);
  const total = selectTotalDuration(s);
  const lane = getLane(s, selection.laneId);
  if (!lane) return;

  if (selection.regionId) {
    const r = lane.regions.find((x) => x.id === selection.regionId);
    if (!r) return;
    const d = Math.max(-r.start, Math.min(delta, total - r.end));
    if (!d) return;
    recordHistory();
    useMixStore.setState((st) => withLane(st, selection.laneId, (l) => ({
      ...l,
      regions: l.regions.map((x) => (
        x.id === r.id ? { ...x, start: x.start + d, end: x.end + d } : x
      )),
    })));
  } else {
    const curve = selection.curve === 'pan' ? 'pan' : 'env';
    const p = (lane[curve] ?? []).find((x) => x.id === selection.pointId);
    if (!p) return;
    const t = Math.max(0, Math.min(p.t + delta, total));
    if (t === p.t) return;
    recordHistory();
    useMixStore.setState((st) => withLane(st, selection.laneId, (l) => ({
      ...l,
      [curve]: l[curve]
        .map((x) => (x.id === p.id ? { ...x, t } : x))
        .sort((a, b) => a.t - b.t),
    })));
  }
  engine.modelChanged();
};
