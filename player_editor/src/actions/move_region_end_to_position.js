import { audioEngine, audioPosition } from "../Waveform";
import { currentSong } from "../Lyrics";
import { toRegions } from "../utils";
import { regionRange, updatingRegionStart } from "./regions";

export const moveRegionEndToPosition = async (get, set) => {
  const engine = get(audioEngine);

  if (!engine.hasRegion()) return;

  const position = get(audioPosition);
  const song = get(currentSong);

  const { start, end } = engine.getRegion();

  if (position <= start) return;

  // The region being edited is still in the timings at its original start, skip it
  const editedStart = updatingRegionStart();

  const nextStart = toRegions(song.timings)
    .map((r) => r.start)
    .filter((s) => s > start && s !== editedStart)
    .reduce((min, s) => Math.min(min, s), Infinity);

  if (position > nextStart) return;

  engine.resizeRegionOnTheRight(position - end);

  set(regionRange, { start, end: position, changed: true });
};
