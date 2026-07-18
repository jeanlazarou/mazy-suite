import { audioEngine } from "../Waveform";
import { savedRegion } from "../RegionMemory";

export const selectRegion = async (get, set) => {
  const engine = get(audioEngine);

  const region = engine.getRegion();

  set(savedRegion, { ...region });
};
