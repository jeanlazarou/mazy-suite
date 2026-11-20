import { activeRegion } from "./regions";

// Leaves the region being edited, forgetting the change not yet accepted
export const dismissRegion = async (_get, set) => {
  set(activeRegion, undefined);
};
