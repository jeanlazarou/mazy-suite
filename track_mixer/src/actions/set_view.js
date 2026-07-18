import { useMixStore, selectTotalDuration, MIN_VIEW } from '../state/store';

// Primitive behind zooming/panning the time window (wheel + zoom buttons).
// Pure view state: not undoable, not saved.
export const setView = (start, duration) => {
  const s = useMixStore.getState();
  const total = selectTotalDuration(s);
  if (!total) return;
  if (duration === null || duration >= total) {
    useMixStore.setState({ view: { start: 0, duration: null } });
    return;
  }
  const d = Math.max(MIN_VIEW, duration);
  useMixStore.setState({
    view: { start: Math.max(0, Math.min(start, total - d)), duration: d },
  });
};
