import { audioPosition } from "../Waveform";
import { stepRelativeToZoom, zoomLevel } from "../ZoomInput";

import { cue } from "./regions";

export const movePlaybackPositionForward = async (get, set) => {
  cue(get, set, get(audioPosition) + stepRelativeToZoom(get(zoomLevel)));
};
