import { useMixStore } from '../state/store';

// Tracks the lane under the pointer so S/M hotkeys know their target.
export const hoverTrack = (trackId) => {
  useMixStore.setState({ hoveredTrackId: trackId });
};
