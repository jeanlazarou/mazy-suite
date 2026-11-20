import { atom } from "jotai";

export const exportRequest = atom(false);

export const oneIsOpen = async (get) => get(exportRequest);
