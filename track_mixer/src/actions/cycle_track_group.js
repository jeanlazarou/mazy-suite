import { useMixStore, withLane } from '../state/store';
import { engine } from '../audio/engine';
import { recordHistory } from '../state/history';

// Clicking the color dot on a track header cycles its membership:
// none → group 1 → group 2 → … → none.
export const cycleTrackGroup = (trackId) => {
  const s = useMixStore.getState();
  if (!s.groups.length) return;
  const track = s.tracks.find((t) => t.id === trackId);
  if (!track) return;
  const index = s.groups.findIndex((g) => g.id === track.group);
  const next = index + 1 < s.groups.length ? s.groups[index + 1].id : index === -1 ? s.groups[0].id : null;
  recordHistory();
  useMixStore.setState((st) => withLane(st, trackId, (t) => ({ ...t, group: next })));
  engine.modelChanged();
};
