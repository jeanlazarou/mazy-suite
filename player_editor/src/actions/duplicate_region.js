import { audioEngine } from "../Waveform";
import { unSelectRegion } from "./regions";

export const duplicateRegion = async (get) => {
  const engine = get(audioEngine);

  const region = engine.getRegion();

  engine.newRegion({ start: region.start, end: region.end });

  unSelectRegion();
};
