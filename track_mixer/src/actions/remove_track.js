import { useMixStore } from '../state/store';
import { engine } from '../audio/engine';
import { recordHistory } from '../state/history';

// × on a track header removes the track from the mix. Undoable: the audio
// buffer stays in the engine, so undo restores the track fully.
export const removeTrack = (trackId) => {
  recordHistory();
  useMixStore.setState((s) => {
    const { [trackId]: _, ...durations } = s.durations;
    return {
      tracks: s.tracks.filter((t) => t.id !== trackId),
      durations,
      selection: s.selection && s.selection.laneId === trackId ? null : s.selection,
      hoveredTrackId: s.hoveredTrackId === trackId ? null : s.hoveredTrackId,
    };
  });
  engine.modelChanged();
};
