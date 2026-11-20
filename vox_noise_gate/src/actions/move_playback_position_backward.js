import { audioPosition } from "../Waveform";
import { stepRelativeToZoom, zoomLevel } from "../ZoomInput";

import { cue } from "./regions";

export const movePlaybackPositionBackward = async (get, set) => {
  cue(get, set, Math.max(0, get(audioPosition) - stepRelativeToZoom(get(zoomLevel))));
};
