import { audioPosition } from "../Waveform";
import { savedPosition } from "../PositionMemory";

export const memorizePosition = async (get, set) => {
  set(savedPosition, get(audioPosition));
};
