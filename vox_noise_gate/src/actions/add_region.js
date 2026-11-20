import { currentRecording } from "../Editor";
import { audioPosition } from "../Waveform";

import { MIN_REGION } from "../core/gate";

import { activeRegion, releaseActive } from "./regions";

export const NEW_REGION_LENGTH = 0.5;

// A region muted by hand, waiting for Enter (or for another region to be
// selected) to be kept
export function startNewRegion(get, set, start, end) {
  const recording = get(currentRecording);

  if (!recording) return;

  const s = Math.max(0, start);
  const e = Math.min(recording.duration, end);

  if (e - s < MIN_REGION) return;

  releaseActive(get, set);

  set(activeRegion, { id: undefined, origin: "new", start: s, end: e, original: null, changed: true });
}

export const addRegion = async (get, set) => {
  const position = get(audioPosition);

  startNewRegion(get, set, position, position + NEW_REGION_LENGTH);
};
