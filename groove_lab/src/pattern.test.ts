import { describe, expect, it } from "vitest";
import {
  VELOCITY_LEVELS,
  addBassNote,
  clearBass,
  createDefaultPattern,
  createEmptyPattern,
  cycleBassNoteVelocity,
  cycleDrumStepVelocity,
  clearDrums,
  getDrumStep,
  removeBassNote,
  resizePattern,
  setDrumStep,
  toggleDrumStep,
} from "./pattern";
import { DRUM_LANES, midiToNoteName, totalSteps } from "./types";

describe("createEmptyPattern", () => {
  it("has one empty lane per drum and no bass", () => {
    const p = createEmptyPattern();
    expect(Object.keys(p.drums).sort()).toEqual(
      DRUM_LANES.map((l) => l.id).sort(),
    );
    for (const lane of DRUM_LANES) expect(p.drums[lane.id]).toEqual([]);
    expect(p.bass).toEqual([]);
    expect(totalSteps(p)).toBe(16);
  });
});

describe("toggleDrumStep", () => {
  it("adds then removes a hit, without mutating the input", () => {
    const p0 = createEmptyPattern();
    const p1 = toggleDrumStep(p0, "kick", 3);
    expect(getDrumStep(p1, "kick", 3)).toBeDefined();
    expect(getDrumStep(p0, "kick", 3)).toBeUndefined();
    const p2 = toggleDrumStep(p1, "kick", 3);
    expect(getDrumStep(p2, "kick", 3)).toBeUndefined();
  });

  it("keeps lane steps sorted by step", () => {
    let p = createEmptyPattern();
    for (const step of [12, 0, 6]) p = toggleDrumStep(p, "snare", step);
    expect(p.drums.snare.map((s) => s.step)).toEqual([0, 6, 12]);
  });
});

describe("setDrumStep", () => {
  it("re-adding an existing step replaces it instead of duplicating", () => {
    let p = createEmptyPattern();
    p = setDrumStep(p, "kick", 0, true, 0.5);
    p = setDrumStep(p, "kick", 0, true, 1.0);
    expect(p.drums.kick).toEqual([{ step: 0, velocity: 1.0 }]);
  });
});

describe("cycleDrumStepVelocity", () => {
  it("cycles through all velocity levels and wraps", () => {
    let p = setDrumStep(createEmptyPattern(), "snare", 4, true, VELOCITY_LEVELS[1]);
    const seen: number[] = [];
    for (let i = 0; i < VELOCITY_LEVELS.length; i++) {
      p = cycleDrumStepVelocity(p, "snare", 4);
      seen.push(getDrumStep(p, "snare", 4)!.velocity);
    }
    expect(new Set(seen)).toEqual(new Set(VELOCITY_LEVELS));
    expect(seen[seen.length - 1]).toBe(VELOCITY_LEVELS[1]);
  });

  it("is a no-op on an empty step", () => {
    const p = createEmptyPattern();
    expect(cycleDrumStepVelocity(p, "kick", 0)).toBe(p);
  });
});

describe("resizePattern", () => {
  it("growing keeps all hits", () => {
    const p = resizePattern(createDefaultPattern(), 2);
    expect(totalSteps(p)).toBe(32);
    expect(p.drums.kick.length).toBe(3);
  });

  it("shrinking drops hits beyond the new length", () => {
    let p = createEmptyPattern(2);
    p = setDrumStep(p, "kick", 0, true);
    p = setDrumStep(p, "kick", 20, true);
    p.bass = [
      { step: 4, durationSteps: 2, midiPitch: 40, velocity: 0.8 },
      { step: 24, durationSteps: 2, midiPitch: 40, velocity: 0.8 },
    ];
    const shrunk = resizePattern(p, 1);
    expect(shrunk.drums.kick.map((s) => s.step)).toEqual([0]);
    expect(shrunk.bass.map((n) => n.step)).toEqual([4]);
  });
});

describe("addBassNote (monophonic)", () => {
  it("adds a note with default velocity, sorted by step", () => {
    let p = createEmptyPattern();
    p = addBassNote(p, { step: 8, durationSteps: 2, midiPitch: 33 });
    p = addBassNote(p, { step: 0, durationSteps: 4, midiPitch: 28 });
    expect(p.bass.map((n) => n.step)).toEqual([0, 8]);
    expect(p.bass[0].velocity).toBeGreaterThan(0);
  });

  it("removes notes that start inside the new note's range (any pitch)", () => {
    let p = createEmptyPattern();
    p = addBassNote(p, { step: 4, durationSteps: 2, midiPitch: 33 });
    p = addBassNote(p, { step: 2, durationSteps: 6, midiPitch: 40 });
    expect(p.bass).toHaveLength(1);
    expect(p.bass[0]).toMatchObject({ step: 2, durationSteps: 6, midiPitch: 40 });
  });

  it("truncates a note that rings into the new one", () => {
    let p = createEmptyPattern();
    p = addBassNote(p, { step: 0, durationSteps: 8, midiPitch: 33 });
    p = addBassNote(p, { step: 4, durationSteps: 2, midiPitch: 36 });
    expect(p.bass).toHaveLength(2);
    expect(p.bass[0]).toMatchObject({ step: 0, durationSteps: 4 });
  });

  it("keeps the tab fingering hint when given, omits it otherwise", () => {
    let p = createEmptyPattern();
    p = addBassNote(p, { step: 0, durationSteps: 2, midiPitch: 45, string: 1 });
    p = addBassNote(p, { step: 4, durationSteps: 2, midiPitch: 45 });
    expect(p.bass[0].string).toBe(1);
    expect("string" in p.bass[1]).toBe(false);
  });

  it("clips duration at the end of the pattern and rejects out-of-range steps", () => {
    let p = createEmptyPattern(); // 16 steps
    p = addBassNote(p, { step: 14, durationSteps: 8, midiPitch: 33 });
    expect(p.bass[0].durationSteps).toBe(2);
    expect(addBassNote(p, { step: 16, durationSteps: 1, midiPitch: 33 }).bass)
      .toHaveLength(1);
  });
});

describe("removeBassNote / cycleBassNoteVelocity / clearBass", () => {
  it("removes by start step only", () => {
    let p = addBassNote(createEmptyPattern(), { step: 4, durationSteps: 4, midiPitch: 33 });
    expect(removeBassNote(p, 5).bass).toHaveLength(1); // 5 is inside, not the start
    expect(removeBassNote(p, 4).bass).toHaveLength(0);
  });

  it("cycles velocity levels and wraps", () => {
    let p = addBassNote(createEmptyPattern(), {
      step: 0, durationSteps: 2, midiPitch: 33, velocity: VELOCITY_LEVELS[1],
    });
    p = cycleBassNoteVelocity(p, 0);
    expect(p.bass[0].velocity).toBe(VELOCITY_LEVELS[2]);
    p = cycleBassNoteVelocity(p, 0);
    expect(p.bass[0].velocity).toBe(VELOCITY_LEVELS[0]);
  });

  it("clearBass empties bass but keeps drums", () => {
    const p = clearBass(createDefaultPattern());
    expect(p.bass).toEqual([]);
    expect(p.drums.kick.length).toBeGreaterThan(0);
  });
});

describe("midiToNoteName", () => {
  it("maps the bass range endpoints", () => {
    expect(midiToNoteName(28)).toBe("E1");
    expect(midiToNoteName(33)).toBe("A1");
    expect(midiToNoteName(55)).toBe("G3");
  });
});

describe("clearDrums", () => {
  it("empties every lane but keeps bass and settings", () => {
    const p = createDefaultPattern();
    p.bass = [{ step: 0, durationSteps: 4, midiPitch: 36, velocity: 0.8 }];
    const cleared = clearDrums(p);
    for (const lane of DRUM_LANES) expect(cleared.drums[lane.id]).toEqual([]);
    expect(cleared.bass.length).toBe(1);
    expect(cleared.bpm).toBe(p.bpm);
  });
});
