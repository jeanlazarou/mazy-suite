import { audioEngine } from "../Waveform";
import { regionRange } from "./regions";
import { stepRelativeToZoom, zoomLevel } from "../ZoomInput";

export const enlargeRegionOnTheRight = async (get, set) => {
  const engine = get(audioEngine);
  const level = get(zoomLevel);

  const step = stepRelativeToZoom(level);

  const { start, end } = engine.getRegion();

  engine.resizeRegionOnTheRight(step);

  set(regionRange, { start: start, end: end + step, changed: true });
};
