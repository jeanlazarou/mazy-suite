// Undo/redo by snapshot. A twin document is a handful of segments, so a
// snapshot is cheaper than a command log and cannot drift from the document.
// One entry per gesture: a drag pushes once, on pointer-up, not per pixel.

import { useTwinStore, refreshLayout } from './store.js';

const LIMIT = 100;

const snapshot = () => {
  const { doc, selected } = useTwinStore.getState();
  return { segments: doc?.segments ?? [], selected };
};

export function pushHistory() {
  const { past } = useTwinStore.getState();
  useTwinStore.setState({
    past: [...past, snapshot()].slice(-LIMIT),
    future: [],
  });
}

export function clearHistory() {
  useTwinStore.setState({ past: [], future: [] });
}

function restore(entry) {
  const { doc } = useTwinStore.getState();
  useTwinStore.setState({
    doc: { ...doc, segments: entry.segments },
    selected: entry.selected,
    dirty: true,
    pending: null,
  });
  refreshLayout();
}

export function undo() {
  const { past } = useTwinStore.getState();
  if (!past.length) return;
  const entry = past[past.length - 1];
  const now = snapshot();
  useTwinStore.setState({
    past: past.slice(0, -1),
    future: [now, ...useTwinStore.getState().future].slice(0, LIMIT),
  });
  restore(entry);
}

export function redo() {
  const { future } = useTwinStore.getState();
  if (!future.length) return;
  const entry = future[0];
  const now = snapshot();
  useTwinStore.setState({
    future: future.slice(1),
    past: [...useTwinStore.getState().past, now].slice(-LIMIT),
  });
  restore(entry);
}
