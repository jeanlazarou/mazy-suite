import { stepRelativeToZoom, zoomLevel } from "../ZoomInput";

import { nudgeActive } from "./regions";

// the whole region, one step later
export const moveRegionToTheRight = async (get, set) => {
  const step = stepRelativeToZoom(get(zoomLevel));

  nudgeActive(get, set, step, step);
};
