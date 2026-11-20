import { stepRelativeToZoom, zoomLevel } from "../ZoomInput";

import { nudgeActive } from "./regions";

// the region ends one step later
export const enlargeRegionOnTheRight = async (get, set) => {
  const step = stepRelativeToZoom(get(zoomLevel));

  nudgeActive(get, set, 0, step);
};
