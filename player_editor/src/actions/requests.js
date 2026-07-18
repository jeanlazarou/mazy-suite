import { atom } from "jotai";

export const projectOpenRequest = atom(false);

export const openRequest = atom(false);

export const checkTimings = atom(false);

export const saveRequest = atom(false);

export const oneIsOpen = async (get) => {
  const openRequested = get(openRequest);
  const saveRequested = get(saveRequest);
  const checkRequested = get(checkTimings);
  const projectOpenRequested = get(projectOpenRequest);

  return (
    openRequested || saveRequested || checkRequested || projectOpenRequested
  );
};
