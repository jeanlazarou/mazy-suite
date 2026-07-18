import { oneIsOpen, openRequest } from "./requests";

export const requestOpen = async (get, set) => {
  if (await oneIsOpen(get)) return;

  set(openRequest, true);
};
