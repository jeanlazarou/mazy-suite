import { monitorMode } from "../Waveform";

// What plays: the gated result, the recording as it is (bypass), or only what
// the gate removes, to check no voice goes with the noise
export const toggleBypass = async (get, set) => {
  set(monitorMode, get(monitorMode) === "original" ? "gated" : "original");
};

export const toggleRemoved = async (get, set) => {
  set(monitorMode, get(monitorMode) === "removed" ? "gated" : "removed");
};
