import { visibleMarkers } from "../Waveform";

export const toggleMarkerLabels = async (get, set) => {
  const visible = get(visibleMarkers);
  set(visibleMarkers, !visible);
};
