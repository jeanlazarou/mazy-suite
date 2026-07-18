import { create } from 'zustand';
import { engine } from '../audio/engine';

// State shape only — every user-facing operation lives in src/actions/,
// one file per action (same convention as player_editor).

export const MASTER_ID = 'master';

export const useMixStore = create(() => ({
  tracks: [], // { id, name, color, fileName, env, regions, solo, mute, eq, group }
  groups: [], // { id, name, color, isGroup, env, regions: [] } — VCA lanes, no audio
  master: { id: MASTER_ID, name: 'MASTER', color: '#ffd75e', isMaster: true, env: [], regions: [] },
  durations: {}, // trackId -> stem length (s)
  collapsedGroups: {}, // groupId -> true when member lanes are hidden
  bypass: false,
  playing: false,
  selection: null, // { laneId, regionId } | { laneId, pointId, curve: 'env'|'pan' }
  hoveredTrackId: null,
  panMode: false, // when on, line gestures edit the pan curve instead of gain
  view: { start: 0, duration: null }, // zoom window; null duration = fit whole song
  song: null, // { album, title } when opened from the suite's data tree
  markers: [], // [{ t, label }] from SRT — shown on the ruler, snapped to
  markersSource: null, // SRT file name, persisted in mix.json
  markersVisible: true, // also gates snapping
  toast: null, // transient status message
  helpOpen: false, // hotkeys & gestures reference popup
  past: [], // undo snapshots of { tracks, groups, master }
  future: [], // redo snapshots
}));

export function getLane(state, laneId) {
  if (laneId === MASTER_ID) return state.master;
  return (
    state.tracks.find((t) => t.id === laneId) ??
    state.groups.find((g) => g.id === laneId)
  );
}

// Apply fn to one lane (track, group or master), immutably.
export function withLane(state, laneId, fn) {
  if (laneId === MASTER_ID) return { master: fn(state.master) };
  if (state.groups.some((g) => g.id === laneId)) {
    return { groups: state.groups.map((g) => (g.id === laneId ? fn(g) : g)) };
  }
  return { tracks: state.tracks.map((t) => (t.id === laneId ? fn(t) : t)) };
}

export const selectTotalDuration = (s) => {
  const ds = Object.values(s.durations);
  return ds.length ? Math.max(...ds) : 0;
};

export const MIN_VIEW = 0.5; // s — deepest zoom

// The visible time window, clamped against the song length.
export const selectView = (s) => {
  const total = selectTotalDuration(s);
  const duration = Math.min(s.view.duration ?? total, total) || total;
  const start = Math.max(0, Math.min(s.view.start, total - duration));
  return { start, duration };
};

engine.getModel = () => {
  const s = useMixStore.getState();
  return { tracks: s.tracks, groups: s.groups, master: s.master, bypass: s.bypass };
};
engine.onPlayingChanged = (playing) => useMixStore.setState({ playing });
