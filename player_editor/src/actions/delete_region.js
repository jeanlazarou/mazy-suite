import { audioEngine } from "../Waveform";
import { currentSong } from "../Lyrics";
import { toMarkers } from "../utils";
import { visibleMarkers } from "../Waveform";

export const deleteRegion = async (get, set, regionId) => {
  const engine = get(audioEngine);
  const song = get(currentSong);
  const labels = get(visibleMarkers);

  // Extract the region index from the region ID (format: "timing-{index}")
  const match = regionId.match(/^timing-(\d+)$/);
  if (!match) {
    return; // Not a valid timing region ID
  }

  const markerIndex = parseInt(match[1], 10);

  // The marker index corresponds to the region's position in the markers array
  // Each region uses 2 entries in the timings array (start and end)
  const regionIndex = markerIndex * 2;

  const timings = song.timings;

  if (regionIndex < 0 || regionIndex >= timings.length) {
    return; // Invalid index
  }

  // Get the region start time for savedTimings cleanup
  const foundRegionStart = timings[regionIndex] ? timings[regionIndex][0] : null;

  // Create new timings array without the deleted region
  const newTimings = [...timings];
  newTimings.splice(regionIndex, 2); // Remove the pair of timings

  // Re-index all remaining timings
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

  // Remove from savedTimings if it was saved
  let updatedSavedTimings = song.savedTimings;
  if (song.savedTimings.has(foundRegionStart)) {
    updatedSavedTimings = new Set(song.savedTimings);
    updatedSavedTimings.delete(foundRegionStart);
  }

  updated.savedTimings = updatedSavedTimings;

  set(currentSong, updated);

  // Update markers on waveform
  engine.setMarkers(toMarkers(updated.timings, updated.savedTimings, labels));
};
