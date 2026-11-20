import { stepRelativeToZoom, zoomLevel } from "../ZoomInput";

import { nudgeActive } from "./regions";

// the region ends one step earlier
export const shrinkRegionOnTheRight = async (get, set) => {
  const step = stepRelativeToZoom(get(zoomLevel));

  nudgeActive(get, set, 0, -step);
};
