import { setActiveRange } from "./regions";

// The region being edited, dragged or resized with the mouse
export const changeRegionRange = async (get, set, start, end) => {
  setActiveRange(get, set, start, end);
};
