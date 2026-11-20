import { oneIsOpen } from "./requests";

export const RECORDING_INPUT = "recording-file";

export const requestFileOpen = async (get) => {
  if (await oneIsOpen(get)) return;

  document.getElementById(RECORDING_INPUT)?.click();
};
