import { savedPosition } from "../PositionMemory";
import { audioEngine, audioPosition } from "../Waveform";

export const gotoMemorizedPosition = async (get, set) => {
  const engine = get(audioEngine);
  const position = get(savedPosition);

  if (position === undefined) return;

  engine.seekTo(position);

  set(audioPosition, position);
};
