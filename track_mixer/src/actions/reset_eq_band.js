import { useMixStore } from '../state/store';
import { recordHistory } from '../state/history';
import { setEq } from './set_eq';

// Double-click a slider resets its band to 0 dB.
export const resetEqBand = (trackId, band) => {
  const track = useMixStore.getState().tracks.find((t) => t.id === trackId);
  if (!track || !track.eq[band]) return;
  recordHistory();
  setEq(trackId, band, 0);
};
