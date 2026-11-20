import { audioPosition } from "../Waveform";

import { activeRegion, setActiveRange } from "./regions";

// Ignored when the playback position is not after the region start
export const moveRegionEndToPosition = async (get, set) => {
  const active = get(activeRegion);
  const position = get(audioPosition);

  if (!active || position <= active.start) return;

  setActiveRange(get, set, active.start, position);
};
