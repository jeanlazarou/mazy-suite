// How a band draws its two sides: each at its own length ('true'), or both
// stretched to fill the band ('aligned').

import { useTwinStore } from '../state/store.js';
import { showToast } from './show_toast.js';

export function toggleLayoutMode() {
  const { layoutMode, clock, position } = useTwinStore.getState();
  const next = layoutMode === 'true' ? 'aligned' : 'true';
  // Keep the current moment in view across the switch: the two layouts put
  // it at very different scroll positions.
  useTwinStore.setState({ layoutMode: next, reveal: { side: clock, t: position } });
  showToast(
    next === 'true'
      ? 'true scale — each song at its own length; the ribbons show where they differ'
      : 'aligned — both sides stretched to fill each band; the difference in length is hidden',
  );
}

export function toggleMagnet() {
  const magnet = !useTwinStore.getState().magnet;
  useTwinStore.setState({ magnet });
  showToast(magnet ? 'magnet on' : 'magnet off — edges land where you put them');
}
