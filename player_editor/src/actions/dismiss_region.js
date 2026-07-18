import { currentSong } from "../Lyrics";
import { audioEngine, visibleMarkers } from "../Waveform";
import { toMarkers } from "../utils";
import { regionRange, unSelectRegion } from "./regions";

export const dismissRegion = async (get, set) => {
  const engine = get(audioEngine);
  const song = get(currentSong);
  const labels = get(visibleMarkers);

  engine.cancelRegion();

  // Refresh markers so the region reappears as a timing marker
  engine.setMarkers(toMarkers(song.timings, song.savedTimings, labels));

  unSelectRegion();

  set(regionRange, undefined);
};
