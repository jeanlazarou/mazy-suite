import { gateRegions } from "../GateSettings";
import { audioPosition } from "../Waveform";

import { nextRegion, previousRegion } from "../core/regions";

import { activate, activeRegion, releaseActive } from "./regions";

function step(get, set, find) {
  const active = get(activeRegion);
  // without a region selected, one starting right at the playhead is next
  const from = active ? active.start : get(audioPosition) - 0.002;

  releaseActive(get, set);

  const region = find(get(gateRegions), from);

  if (region) activate(get, set, region, { cueIt: true });
}

// Steps through the regions to review them, the playback following
export const selectNextRegion = async (get, set) => step(get, set, nextRegion);

export const selectPreviousRegion = async (get, set) => step(get, set, previousRegion);
