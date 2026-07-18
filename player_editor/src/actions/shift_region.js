import { currentDuration, currentSong } from "../Lyrics";
import { savedRegion } from "../RegionMemory";
import { audioPosition } from "../Waveform";
import { shiftTimingsInRange } from "../utils";

export const shiftRegion = async (get, set) => {
  const region = get(savedRegion);
  const position = get(audioPosition);
  const song = get(currentSong);
  const duration = get(currentDuration);

  const newSong = shiftTimingsInRange(song, region, position, duration);

  if (newSong) set(currentSong, newSong);

  set(savedRegion, undefined);
};
