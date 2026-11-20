import { gateEdits } from "../GateSettings";

import { NO_EDITS } from "../core/regions";

import { activeRegion } from "./regions";

export const resetEdits = (_get, set) => {
  set(activeRegion, undefined);
  set(gateEdits, NO_EDITS);
};
