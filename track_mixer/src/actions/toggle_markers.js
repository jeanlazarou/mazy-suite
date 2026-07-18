import { useMixStore } from '../state/store';

// Hide/show SRT markers on the ruler; hiding also disables snapping.
export const toggleMarkers = () => {
  useMixStore.setState((s) => ({ markersVisible: !s.markersVisible }));
};
