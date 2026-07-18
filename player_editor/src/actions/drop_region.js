import { audioEngine, audioPosition, visibleMarkers } from "../Waveform";
import { currentSong } from "../Lyrics";
import { toMarkers, updateTiming } from "../utils";

const OFFSET = 0.25; // seconds before current position
const DURATION = 1; // region duration in seconds

export const dropRegion = async (get, set) => {
  const engine = get(audioEngine);

  if (!engine.isPlaying()) return;

  const position = get(audioPosition);
  const song = get(currentSong);
  const labels = get(visibleMarkers);

  const start = Math.max(0, position - OFFSET);
  const end = start + DURATION;

  const timings = updateTiming(song.timings, { start, end });
  const updated = { ...song, timings };

  set(currentSong, updated);

  engine.setMarkers(toMarkers(updated.timings, updated.savedTimings, labels));
};
