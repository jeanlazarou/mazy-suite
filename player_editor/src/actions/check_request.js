import { checkTimings, oneIsOpen } from "./requests";

export const requestCheck = async (get, set) => {
  if (await oneIsOpen(get)) return;

  set(checkTimings, true);
};
