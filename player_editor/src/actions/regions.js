import { atom } from "jotai";

import { currentSong } from "../Lyrics";

import { toMarkers, toRegions, updateTiming } from "../utils";

let updatingRegion = undefined;

export const regionRange = atom(undefined);
export const isUpdatingRegion = () => {
  return updatingRegion !== undefined;
};

export const selectRegion = (region) => {
  updatingRegion = region;
};

export const unSelectRegion = () => {
  updatingRegion = undefined;
};

export const keepNewRegion = (engine, set, song, start, end, labels) => {
  const found = toRegions(song.timings).find(
    (e) => e.start === start && e.end === end
  );

  if (found === undefined) {
    updatingRegion = { start, end };

    addRegion(engine, song, updatingRegion, set, labels);

    set(regionRange, { start, end, changed: false });
  }
};

const addRegion = (engine, song, region, set, labels) => {
  const timings = updateTiming(song.timings, {
    start: region.start,
    end: region.end,
  });

  const updated = { ...song, timings };

  set(currentSong, updated);

  engine.setMarkers(toMarkers(updated.timings, updated.savedTimings, labels));
};

export const applyRegionUpdate = (engine, set, song, start, end, labels) => {
  const updated = { ...song };

  updated.savedTimings = removeFromSaved(song, updatingRegion.start);
  updated.timings = updateRegionTiming(song, start, end);

  set(currentSong, updated);

  engine.setMarkers(toMarkers(updated.timings, updated.savedTimings, labels));

  updatingRegion.start = start;
  updatingRegion.end = end;

  set(regionRange, { start, end, changed: false });
};

const removeFromSaved = (song, start) => {
  if (song.savedTimings.has(start)) {
    const savedTimings = new Set(song.savedTimings.values());

    savedTimings.delete(start);

    return savedTimings;
  }

  return song.savedTimings;
};

const updateRegionTiming = (song, start, end) => {
  // Find the index where the timing has the start time AND has a non-null index (not an end marker)
  const i = song.timings.findIndex((e) => e[0] === updatingRegion.start && e[1] !== null);

  if (i >= 0) {
    const updated = updateTiming(song.timings, { start, end }, i);
    return updated;
  }

  return song.timings;
};
