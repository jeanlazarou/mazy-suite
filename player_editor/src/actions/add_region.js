import { audioEngine, audioPosition, visibleMarkers } from "../Waveform";
import { currentSong } from "../Lyrics";
import { toMarkers } from "../utils";
import { regionRange, unSelectRegion } from "./regions";

export const addRegion = async (get, set) => {
  const engine = get(audioEngine);
  const position = get(audioPosition);
  const song = get(currentSong);
  const labels = get(visibleMarkers);

  unSelectRegion();

  // Deactivate any existing active region first
  engine.deactivateRegion();

  // Refresh markers to recreate the deactivated region as a timing marker
  engine.setMarkers(toMarkers(song.timings, song.savedTimings, labels));

  const start = position;
  const end = position + 2;

  // Create new active region (won't call deactivateRegion since timingRegion is now undefined)
  engine.newRegion({ start, end });

  set(regionRange, { start, end, changed: true });

  unSelectRegion();
};
