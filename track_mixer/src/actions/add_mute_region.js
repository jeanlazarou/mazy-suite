import { useMixStore, withLane } from '../state/store';
import { engine } from '../audio/engine';
import { MICRO_FADE } from '../model/envelope';
import { recordHistory } from '../state/history';
import { uid } from './ids';

// Shift+drag on a track creates a mute region; edges get a micro-fade so
// the cut never clicks. The new region becomes the selection.
export const addMuteRegion = (trackId, start, end) => {
  recordHistory();
  const id = uid('rgn');
  useMixStore.setState((s) => ({
    ...withLane(s, trackId, (t) => ({
      ...t,
      regions: [...t.regions, {
        id, start, end, fade: MICRO_FADE, shape: 'linear', mode: 'mute', enabled: true,
      }],
    })),
    selection: { laneId: trackId, regionId: id },
  }));
  engine.modelChanged();
  return id;
};
