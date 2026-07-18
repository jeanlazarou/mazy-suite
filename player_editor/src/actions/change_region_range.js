import { regionRange } from "./regions";

export const newRegionRange = async (_get, set, start, end) => {
  set(regionRange, { start, end, changed: true });
};
