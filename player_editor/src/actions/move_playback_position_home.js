import { audioEngine, audioPosition } from "../Waveform";

export const movePlaybackPositionHome = async (get, set) => {
  const engine = get(audioEngine);
  const position = get(audioPosition);

  if (position === undefined) return;

  engine.seekTo(0);

  set(audioPosition, 0);
};
