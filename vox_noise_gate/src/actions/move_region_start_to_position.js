import { audioPosition } from "../Waveform";

import { activeRegion, setActiveRange } from "./regions";

// Ignored when the playback position is not before the region end
export const moveRegionStartToPosition = async (get, set) => {
  const active = get(activeRegion);
  const position = get(audioPosition);

  if (!active || position >= active.end) return;

  setActiveRange(get, set, position, active.end);
};
