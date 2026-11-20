import { gateEdits } from "../GateSettings";

import { deleteRegion } from "../core/regions";

import { activeRegion } from "./regions";

// The audio of the region being edited is kept after all: the gate will
// leave its range alone from now on
export const deleteActiveRegion = async (get, set) => {
  const active = get(activeRegion);

  if (!active) return;

  set(activeRegion, undefined);

  if (active.origin !== "new") {
    set(gateEdits, deleteRegion(get(gateEdits), active.original));
  }
};
