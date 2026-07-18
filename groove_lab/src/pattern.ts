import type { BassNote, DrumLane, Pattern, Step } from "./types";
import { DRUM_LANES, totalSteps } from "./types";

export const VELOCITY_LEVELS = [0.4, 0.75, 1.0]; // ghost, normal, accent
export const DEFAULT_VELOCITY = 0.75;

export function emptyDrums(): Record<DrumLane, Step[]> {
  const drums = {} as Record<DrumLane, Step[]>;
  for (const lane of DRUM_LANES) drums[lane.id] = [];
  return drums;
}

export function createEmptyPattern(bars = 1): Pattern {
  return {
    bpm: 100,
    bars,
    stepsPerBar: 16,
    swing: 0,
    drums: emptyDrums(),
    bass: [],
  };
}

export function createDefaultPattern(): Pattern {
  const pattern = createEmptyPattern(1);
  const hat = (step: number): Step => ({
    step,
    velocity: step % 4 === 0 ? 1.0 : 0.75,
  });
  pattern.drums.kick = [
    { step: 0, velocity: 1.0 },
    { step: 8, velocity: 1.0 },
    { step: 10, velocity: 0.75 },
  ];
  pattern.drums.snare = [
    { step: 4, velocity: 1.0 },
    { step: 12, velocity: 1.0 },
  ];
  pattern.drums.hhClosed = [0, 2, 4, 6, 8, 10, 12, 14].map(hat);
  // Root notes on A1 following the kick.
  pattern.bass = [
    { step: 0, durationSteps: 4, midiPitch: 33, velocity: 0.9 },
    { step: 8, durationSteps: 2, midiPitch: 33, velocity: 0.9 },
    { step: 10, durationSteps: 4, midiPitch: 33, velocity: 0.75 },
  ];
  return pattern;
}

export function getDrumStep(
  pattern: Pattern,
  lane: DrumLane,
  step: number,
): Step | undefined {
  return pattern.drums[lane].find((s) => s.step === step);
}

export function setDrumStep(
  pattern: Pattern,
  lane: DrumLane,
  step: number,
  on: boolean,
  velocity = DEFAULT_VELOCITY,
): Pattern {
  const others = pattern.drums[lane].filter((s) => s.step !== step);
  const laneSteps = on
    ? [...others, { step, velocity }].sort((a, b) => a.step - b.step)
    : others;
  return { ...pattern, drums: { ...pattern.drums, [lane]: laneSteps } };
}

export function toggleDrumStep(
  pattern: Pattern,
  lane: DrumLane,
  step: number,
): Pattern {
  return setDrumStep(pattern, lane, step, !getDrumStep(pattern, lane, step));
}

/** Accent cycle for an existing hit: normal → accent → ghost → normal. */
export function cycleDrumStepVelocity(
  pattern: Pattern,
  lane: DrumLane,
  step: number,
): Pattern {
  const hit = getDrumStep(pattern, lane, step);
  if (!hit) return pattern;
  const idx = VELOCITY_LEVELS.findIndex((v) => v >= hit.velocity - 1e-9);
  const next =
    VELOCITY_LEVELS[(idx === -1 ? 1 : idx + 1) % VELOCITY_LEVELS.length];
  const laneSteps = pattern.drums[lane].map((s) =>
    s.step === step ? { ...s, velocity: next } : s,
  );
  return { ...pattern, drums: { ...pattern.drums, [lane]: laneSteps } };
}

/** Change bar count, dropping any events that fall outside the new length. */
export function resizePattern(pattern: Pattern, bars: number): Pattern {
  const resized = { ...pattern, bars };
  const max = totalSteps(resized);
  const drums = Object.fromEntries(
    Object.entries(pattern.drums).map(([lane, steps]) => [
      lane,
      steps.filter((s) => s.step < max),
    ]),
  ) as Record<DrumLane, Step[]>;
  const bass = pattern.bass.filter((n) => n.step < max);
  return { ...resized, drums, bass };
}

export function clearDrums(pattern: Pattern): Pattern {
  return { ...pattern, drums: emptyDrums() };
}

// ---- bass ----
// The bass line is monophonic: MonoSynth playback can't voice chords, so the
// data model doesn't allow overlaps either. Adding a note removes notes that
// start inside its range and truncates one that rings into it.

export function getBassNoteAt(
  pattern: Pattern,
  step: number,
): BassNote | undefined {
  return pattern.bass.find(
    (n) => step >= n.step && step < n.step + n.durationSteps,
  );
}

export function addBassNote(
  pattern: Pattern,
  note: Omit<BassNote, "velocity"> & { velocity?: number },
): Pattern {
  const max = totalSteps(pattern);
  if (note.step < 0 || note.step >= max) return pattern;
  const start = note.step;
  const end = Math.min(start + Math.max(1, note.durationSteps), max);
  const others = pattern.bass.flatMap((n) => {
    if (n.step >= start && n.step < end) return []; // starts inside the new note
    const nEnd = n.step + n.durationSteps;
    if (n.step < start && nEnd > start) {
      return [{ ...n, durationSteps: start - n.step }]; // rings into it: truncate
    }
    return [n];
  });
  const added: BassNote = {
    step: start,
    durationSteps: end - start,
    midiPitch: note.midiPitch,
    velocity: note.velocity ?? DEFAULT_VELOCITY,
    ...(note.string !== undefined && { string: note.string }),
  };
  return {
    ...pattern,
    bass: [...others, added].sort((a, b) => a.step - b.step),
  };
}

export function removeBassNote(pattern: Pattern, step: number): Pattern {
  return { ...pattern, bass: pattern.bass.filter((n) => n.step !== step) };
}

/** Accent cycle for an existing bass note: normal → accent → ghost → normal. */
export function cycleBassNoteVelocity(pattern: Pattern, step: number): Pattern {
  const note = pattern.bass.find((n) => n.step === step);
  if (!note) return pattern;
  const idx = VELOCITY_LEVELS.findIndex((v) => v >= note.velocity - 1e-9);
  const next =
    VELOCITY_LEVELS[(idx === -1 ? 1 : idx + 1) % VELOCITY_LEVELS.length];
  const bass = pattern.bass.map((n) =>
    n.step === step ? { ...n, velocity: next } : n,
  );
  return { ...pattern, bass };
}

export function clearBass(pattern: Pattern): Pattern {
  return { ...pattern, bass: [] };
}
