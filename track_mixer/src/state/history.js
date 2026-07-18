import { useMixStore, MASTER_ID } from './store';
import { engine } from '../audio/engine';

// Snapshot undo/redo of the mix model ({tracks, groups, master, durations}
// — structurally shared, so snapshots are cheap). History lives in the
// store (past/future), never in hidden module state. Buffers are not
// snapshotted: actions that swap audio (open/load) clear history instead;
// removing a track keeps its buffer in the engine so undo can restore it.

const LIMIT = 100;

// Call at the START of every undoable action / drag gesture,
// before the state changes.
export const recordHistory = () => {
  useMixStore.setState((s) => ({
    past: [
      ...s.past,
      { tracks: s.tracks, groups: s.groups, master: s.master, durations: s.durations },
    ].slice(-LIMIT),
    future: [],
  }));
};

export const clearHistory = () => {
  useMixStore.setState({ past: [], future: [] });
};

const surviveSelection = (snap, selection) => {
  if (!selection) return null;
  const lane = selection.laneId === MASTER_ID
    ? snap.master
    : snap.tracks.find((t) => t.id === selection.laneId) ??
      snap.groups.find((g) => g.id === selection.laneId);
  if (!lane) return null;
  const alive = selection.regionId
    ? lane.regions.some((r) => r.id === selection.regionId)
    : (lane[selection.curve === 'pan' ? 'pan' : 'env'] ?? [])
        .some((p) => p.id === selection.pointId);
  return alive ? selection : null;
};

// Roll back to the snapshot recorded at gesture start and drop the gesture
// from history entirely (an accidental no-op drag must not become an undo step).
export const cancelGesture = () => {
  stepHistory('undo');
  useMixStore.setState({ future: [] });
};

export const stepHistory = (direction) => {
  const s = useMixStore.getState();
  const [from, to] = direction === 'undo' ? ['past', 'future'] : ['future', 'past'];
  if (!s[from].length) return;
  const snap = s[from][s[from].length - 1];
  useMixStore.setState({
    [from]: s[from].slice(0, -1),
    [to]: [...s[to], { tracks: s.tracks, groups: s.groups, master: s.master, durations: s.durations }],
    tracks: snap.tracks,
    groups: snap.groups,
    master: snap.master,
    durations: snap.durations,
    selection: surviveSelection(snap, s.selection),
  });
  engine.modelChanged();
};
