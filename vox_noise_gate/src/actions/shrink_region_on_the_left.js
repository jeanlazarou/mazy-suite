import { stepRelativeToZoom, zoomLevel } from "../ZoomInput";

import { nudgeActive } from "./regions";

// the region starts one step later
export const shrinkRegionOnTheLeft = async (get, set) => {
  const step = stepRelativeToZoom(get(zoomLevel));

  nudgeActive(get, set, step, 0);
};
