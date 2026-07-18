import { audioEngine, audioPosition } from "../Waveform";
import { stepRelativeToZoom, zoomLevel } from "../ZoomInput";

export const movePlaybackPositionBackward = async (get, set) => {
  const engine = get(audioEngine);
  const position = get(audioPosition);
  const level = get(zoomLevel);

  if (position === undefined) return;

  const step = stepRelativeToZoom(level);

  engine.seekTo(position - step);

  set(audioPosition, position - step);
};
