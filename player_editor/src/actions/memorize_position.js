import { audioPosition } from "../Waveform";
import { savedPosition } from "../PositionMemory";

export const memorizePosition = async (get, set) => {
  const position = get(audioPosition);

  set(savedPosition, position);
};
