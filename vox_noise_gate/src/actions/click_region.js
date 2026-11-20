import { gateEdits, gateRegions } from "../GateSettings";
import { editorMode } from "../Waveform";

import { deleteRegion, removeKeep, splitRegion } from "../core/regions";

import { activate, activeRegion, commitActive, regionAtTime, releaseActive } from "./regions";
import { deleteActiveRegion } from "./delete_region";

// What a click on a region does depends on the editor mode (speed dial).
// Regions are found again by time: keeping a change renumbers them.
export const clickRegion = async (get, set, id, time) => {
  const mode = get(editorMode);

  if (id.startsWith("keep-")) {
    if (mode === "delete") set(gateEdits, removeKeep(get(gateEdits), id));
    return;
  }

  if (id === "active") {
    if (mode === "delete") {
      await deleteActiveRegion(get, set);
    } else if (mode === "split") {
      const accepted = commitActive(get, set);

      set(activeRegion, undefined);

      if (accepted) set(gateEdits, splitRegion(get(gateEdits), accepted, time));
    }
    return;
  }

  releaseActive(get, set);

  const region = regionAtTime(get(gateRegions), time);

  if (!region) return;

  if (mode === "delete") {
    set(gateEdits, deleteRegion(get(gateEdits), region));
  } else if (mode === "split") {
    set(gateEdits, splitRegion(get(gateEdits), region, time));
  } else {
    activate(get, set, region);
  }
};
