import { levelAnalysis } from "../GateSettings";

import { changeParams } from "./change_params";

export const autoThreshold = async (get, set) => {
  const analysis = get(levelAnalysis);

  if (!analysis) return;

  await changeParams(get, set, { threshold: analysis.stats.threshold });
};
