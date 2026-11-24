import { atom } from "jotai";

import { currentRecording } from "../Editor";
import { gateEdits, gateRegions } from "../GateSettings";
import { audioEngine, audioPosition } from "../Waveform";

import { MIN_REGION } from "../core/gate";
import { acceptRegion, fadesOf, mergeForRender } from "../core/regions";

export const LOOP_CONTEXT = 1; // seconds heard either side of the region being edited

// The region being edited: { id, origin: "auto" | "manual" | "new", start,
// end, fadeOut?, fadeIn?, original: { start, end, fadeOut?, fadeIn? } | null,
// changed }. Its own fades, when set, are used instead of the settings'.
export const activeRegion = atom(undefined);

// What the gate mutes, the region being edited taken with its new bounds
export const effectiveRegions = atom((get) => {
  const regions = get(gateRegions);
  const active = get(activeRegion);

  if (!active) return regions;

  return [
    ...regions.filter((r) => r.id !== active.id),
    { id: "active", start: active.start, end: active.end, ...fadesOf(active), origin: "active" },
  ];
});

export const renderedRegions = atom((get) => mergeForRender(get(effectiveRegions)));

export const regionAtTime = (regions, time) =>
  regions.find((r) => r.start <= time && time <= r.end);

const asActive = (region) => ({
  id: region.id,
  origin: region.origin,
  start: region.start,
  end: region.end,
  ...fadesOf(region),
  original: { start: region.start, end: region.end, ...fadesOf(region) },
  changed: false,
});

const changedFrom = (region, original) =>
  !original ||
  original.start !== region.start ||
  original.end !== region.end ||
  original.fadeOut !== region.fadeOut ||
  original.fadeIn !== region.fadeIn;

// Keeps the change made to the region being edited, which stays selected
export function commitActive(get, set) {
  const active = get(activeRegion);

  if (!active || !active.changed) return active;

  const { edits, id } = acceptRegion(get(gateEdits), active);
  const holder = edits.manual.find((m) => m.id === id);

  set(gateEdits, edits);

  const accepted = asActive({ ...holder, origin: "manual" });

  set(activeRegion, accepted);

  return accepted;
}

// Leaves the region being edited, keeping its change (Esc cancels it)
export function releaseActive(get, set) {
  commitActive(get, set);
  set(activeRegion, undefined);
}

export function cue(get, set, time) {
  const engine = get(audioEngine);

  engine.seekTo(time);
  set(audioPosition, engine.getCurrentTime());
}

export function activate(get, set, region, { cueIt = false } = {}) {
  set(activeRegion, asActive(region));

  if (cueIt) cue(get, set, Math.max(0, region.start - LOOP_CONTEXT));
}

// New bounds for the region being edited, kept inside the recording
export function setActiveRange(get, set, start, end) {
  const active = get(activeRegion);
  const recording = get(currentRecording);

  if (!active || !recording) return;

  const s = Math.max(0, start);
  const e = Math.min(recording.duration, end);

  if (e - s < MIN_REGION) return;

  const moved = { ...active, start: s, end: e };

  set(activeRegion, { ...moved, changed: changedFrom(moved, active.original) });
}

// The fades of the region being edited: { fadeOut, fadeIn } in ms, either
// one undefined to use the settings' again
export function setActiveFades(get, set, fades) {
  const active = get(activeRegion);

  if (!active) return;

  const faded = { ...active, ...fades };

  for (const key of ["fadeOut", "fadeIn"]) {
    if (faded[key] === undefined) delete faded[key];
  }

  set(activeRegion, { ...faded, changed: changedFrom(faded, active.original) });
}

export function nudgeActive(get, set, deltaStart, deltaEnd) {
  const active = get(activeRegion);

  if (!active) return;

  let start = active.start + deltaStart;
  let end = active.end + deltaEnd;

  // a region moved as a whole keeps its length at the edges
  if (deltaStart === deltaEnd) {
    const duration = get(currentRecording)?.duration ?? end;
    const shift = Math.max(-active.start, Math.min(duration - active.end, deltaStart));

    start = active.start + shift;
    end = active.end + shift;
  }

  if (end - start < MIN_REGION) return;

  setActiveRange(get, set, start, end);
}
