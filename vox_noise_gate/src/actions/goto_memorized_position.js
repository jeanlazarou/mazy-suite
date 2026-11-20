import { savedPosition } from "../PositionMemory";

import { cue } from "./regions";

export const gotoMemorizedPosition = async (get, set) => {
  const position = get(savedPosition);

  if (position === undefined) return;

  cue(get, set, position);
};
