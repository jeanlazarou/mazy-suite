import { startNewRegion } from "./add_region";

// A range dragged across the waveform in edit mode
export const drawRegion = async (get, set, start, end) => {
  startNewRegion(get, set, start, end);
};
