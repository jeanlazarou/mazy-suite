import { audioEngine, visibleMarkers } from "../Waveform";
import { currentSong } from "../Lyrics";

import { applyRegionUpdate, isUpdatingRegion, keepNewRegion } from "./regions";

export const acceptRegionChange = async (get, set) => {
  const engine = get(audioEngine);
  const song = get(currentSong);
  const labels = get(visibleMarkers);

  const { start, end } = engine.getRegion();

  if (isUpdatingRegion()) {
    applyRegionUpdate(engine, set, song, start, end, labels);
  } else {
    keepNewRegion(engine, set, song, start, end, labels);
  }

  // Accept the changes and update the "original" to the new position
  // but keep the region selected (don't call doneRegion)
  engine.acceptRegion();
};
