import { cue } from "./regions";

export const movePlaybackPositionHome = async (get, set) => {
  cue(get, set, 0);
};
