import { useMixStore, withLane } from '../state/store';
import { engine } from '../audio/engine';
import { clearHistory } from '../state/history';

// Replace a track's stem with a local audio file (ad hoc open-files flow).
// Clears history: undo snapshots must never refer to a swapped-out buffer.
export const loadTrackFile = async (trackId, file) => {
  const buffer = await engine.decode(await file.arrayBuffer());
  engine.setBuffer(trackId, buffer);
  const name = file.name.replace(/\.\w+$/, '');
  useMixStore.setState((s) => ({
    ...withLane(s, trackId, (t) => ({ ...t, name, fileName: file.name })),
    durations: { ...s.durations, [trackId]: buffer.duration },
  }));
  clearHistory();
  engine.modelChanged();
};
