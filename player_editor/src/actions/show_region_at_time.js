import { currentSong } from "../Lyrics";
import { audioEngine, visibleMarkers } from "../Waveform";
import { toMarkers } from "../utils";
import { regionRange, selectRegion } from "./regions";

export const showRegionAtTime = async (get, set, time) => {
  const engine = get(audioEngine);
  const currentValue = get(currentSong);
  const labels = get(visibleMarkers);

  currentValue.timings.forEach((timing, i) => {
    if (timing[0] === time) {
      const start = currentValue.timings[i][0] || 0;
      const end = currentValue.timings[i + 1][0] || 0;

      selectRegion({ start, end });

      // Deactivate any existing active region first
      engine.deactivateRegion();

      // Refresh markers to recreate the deactivated region as a timing marker
      engine.setMarkers(toMarkers(currentValue.timings, currentValue.savedTimings, labels));

      engine.showRegion({
        start,
        end,
      });

      set(regionRange, { start, end, changed: false });
    }
  });
};
