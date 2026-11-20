import { gateParams } from "../GateSettings";

import { releaseActive } from "./regions";
import { reanalyze } from "./reanalyze";

const DETECTION = ["threshold", "minSilence", "keepBefore", "keepAfter", "lowCut"];

export const changeParams = async (get, set, update) => {
  const before = get(gateParams);

  // the detected regions are found anew: leave the one being edited
  if (DETECTION.some((key) => key in update && update[key] !== before[key])) {
    releaseActive(get, set);
  }

  set(gateParams, update);

  if ("lowCut" in update && update.lowCut !== before.lowCut) {
    await reanalyze(get, set);
  }
};
