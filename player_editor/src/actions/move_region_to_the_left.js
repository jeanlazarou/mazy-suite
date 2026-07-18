import { audioEngine } from "../Waveform";
import { regionRange } from "./regions";
import { stepRelativeToZoom, zoomLevel } from "../ZoomInput";

export const moveRegionToTheLeft = async (get, set) => {
  const engine = get(audioEngine);
  const level = get(zoomLevel);

  const step = stepRelativeToZoom(level);

  const { start, end } = engine.getRegion();

  engine.moveRegion(-step);

  set(regionRange, { start: start - step, end: end - step, changed: true });
};
