import { describe, expect, it } from "vitest";

import { LEVEL_FLOOR, analyzeLevels, levelAt, levelToWidth } from "./levels";

const SR = 44100;

const signal = (seconds, f) =>
  Float32Array.from({ length: Math.round(seconds * SR) }, (_, i) => f(i / SR));

describe("analyzeLevels", () => {
  it("measures a full-scale sine at -3 dB", () => {
    const sine = signal(0.5, (t) => Math.sin(2 * Math.PI * 1000 * t));
    const analysis = analyzeLevels([sine], SR);

    expect(levelAt(analysis, 0.25)).toBeCloseTo(-3.01, 1);
  });

  it("gives the floor for digital silence", () => {
    const analysis = analyzeLevels([new Float32Array(SR)], SR);

    expect(levelAt(analysis, 0.5)).toBe(LEVEL_FLOOR);
  });

  it("takes the loudest channel", () => {
    const analysis = analyzeLevels([new Float32Array(SR), new Float32Array(SR).fill(0.5)], SR);

    expect(levelAt(analysis, 0.5)).toBeCloseTo(-6.02, 1);
  });

  it("follows the track in time", () => {
    const track = signal(1, (t) => (t < 0.5 ? 0 : 0.1));
    const analysis = analyzeLevels([track], SR);

    expect(levelAt(analysis, 0.25)).toBe(LEVEL_FLOOR);
    expect(levelAt(analysis, 0.75)).toBeCloseTo(-20, 1);
    expect(levelAt(analysis, 0.5)).toBeGreaterThan(-30); // centred window
  });
});

describe("levelAt", () => {
  it("is the floor before a track is analyzed, and clamps to the track", () => {
    const analysis = analyzeLevels([new Float32Array(SR).fill(0.1)], SR);

    expect(levelAt(null, 1)).toBe(LEVEL_FLOOR);
    expect(levelAt(analysis, 5)).toBeCloseTo(-20, 1);
    expect(levelAt(analysis, -1)).toBeCloseTo(-20, 1);
  });
});

describe("levelToWidth", () => {
  it("maps -90..0 dB onto the meter", () => {
    expect(levelToWidth(0)).toBe(1);
    expect(levelToWidth(-45)).toBe(0.5);
    expect(levelToWidth(-90)).toBe(0);
    expect(levelToWidth(LEVEL_FLOOR)).toBe(0);
    expect(levelToWidth(3)).toBe(1);
  });
});
