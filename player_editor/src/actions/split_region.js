import { audioEngine } from "../Waveform";
import { currentSong } from "../Lyrics";
import { toMarkers } from "../utils";
import { visibleMarkers } from "../Waveform";

export const splitRegion = async (get, set, clickTime) => {
  const engine = get(audioEngine);
  const song = get(currentSong);
  const labels = get(visibleMarkers);

  // Find the region that contains the click time
  const timings = song.timings;
  let regionIndex = -1;
  let regionStart = null;
  let regionEnd = null;

  for (let i = 0; i < timings.length; i += 2) {
    if (timings[i] && timings[i + 1]) {
      const start = timings[i][0];
      const end = timings[i + 1][0];

      if (clickTime >= start && clickTime <= end) {
        regionIndex = i;
        regionStart = start;
        regionEnd = end;
        break;
      }
    }
  }

  if (regionIndex === -1) {
    return;
  }

  // Calculate the split point (where user clicked)
  const splitPoint = clickTime;

  // Ensure the split point is not too close to the boundaries
  const minGap = 0.1; // 100ms minimum gap
  if (splitPoint - regionStart < minGap || regionEnd - splitPoint < minGap) {
    return;
  }

  // Create new timings array by removing the old region and adding two new ones
  const newTimings = [...timings];

  // Replace the old region (2 elements) with two new regions (4 elements)
  // We use placeholder indices that will be fixed in the re-indexing step
  newTimings.splice(regionIndex, 2,
    [regionStart, -1],      // First region start
    [splitPoint, null],     // First region end
    [splitPoint, -1],       // Second region start
    [regionEnd, null]       // Second region end
  );

  // Re-index all timings with proper sequential indices
  const reindexedTimings = [];
  let currentIndex = 1;
  for (let i = 0; i < newTimings.length; i += 2) {
    if (newTimings[i] && newTimings[i + 1]) {
      reindexedTimings.push([newTimings[i][0], currentIndex]);
      reindexedTimings.push([newTimings[i + 1][0], null]);
      currentIndex++;
    }
  }

  // Update the song with new timings
  const updated = { ...song, timings: reindexedTimings };

  // Remove split regions from savedTimings if they were saved
  let updatedSavedTimings = song.savedTimings;
  if (song.savedTimings.has(regionStart)) {
    updatedSavedTimings = new Set(song.savedTimings);
    updatedSavedTimings.delete(regionStart);
  }

  updated.savedTimings = updatedSavedTimings;

  set(currentSong, updated);

  // Update markers on waveform
  engine.setMarkers(toMarkers(updated.timings, updated.savedTimings, labels));
};
