import { waveView } from "../Waveform";

// The waveform, or the level the gate listens to with the threshold on it
export const toggleView = async (get, set) => {
  set(waveView, get(waveView) === "wave" ? "level" : "wave");
};
