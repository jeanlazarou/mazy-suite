import { atom } from "jotai";

export const projectOpenRequest = atom(false);

export const openRequest = atom(false);

export const checkTimings = atom(false);

export const saveRequest = atom(false);

// What does not fit in the SRT file, shown before saving (see toSrtEntries)
export const saveReport = atom(undefined);

export const oneIsOpen = async (get) => {
  const openRequested = get(openRequest);
  const saveRequested = get(saveRequest);
  const reportShown = get(saveReport) !== undefined;
  const checkRequested = get(checkTimings);
  const projectOpenRequested = get(projectOpenRequest);

  return (
    openRequested ||
    saveRequested ||
    reportShown ||
    checkRequested ||
    projectOpenRequested
  );
};
