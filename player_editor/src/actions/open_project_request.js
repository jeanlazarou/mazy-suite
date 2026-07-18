import { oneIsOpen, projectOpenRequest } from "./requests";

export const requestProjectOpen = async (get, set) => {
  if (await oneIsOpen(get)) return;

  set(projectOpenRequest, true);
};
