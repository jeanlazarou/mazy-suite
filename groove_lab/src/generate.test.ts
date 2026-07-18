import { describe, expect, it } from "vitest";
import {
  BASS_MODES,
  STYLE_NAMES,
  applyEuclidean,
  euclidean,
  generateBass,
  generateFill,
  generateStyle,
  humanizeBass,
  humanizeDrums,
} from "./generate";
import { createEmptyPattern, resizePattern } from "./pattern";
import { DRUM_LANES, totalSteps } from "./types";
import type { Pattern } from "./types";

/** mulberry32 — deterministic rng for reproducible generator tests. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function allHits(p: Pattern) {
  return DRUM_LANES.flatMap((l) => p.drums[l.id].map((s) => ({ lane: l.id, ...s })));
}

describe("euclidean", () => {
  it("produces the canonical tresillo E(3,8)", () => {
    expect(euclidean(3, 8)).toEqual([0, 3, 6]);
  });

  it("handles four-on-the-floor and rotation", () => {
    expect(euclidean(4, 16)).toEqual([0, 4, 8, 12]);
    expect(euclidean(4, 16, 2)).toEqual([2, 6, 10, 14]);
  });

  it("degenerate cases: 0 pulses, pulses ≥ steps", () => {
    expect(euclidean(0, 16)).toEqual([]);
    expect(euclidean(16, 16)).toHaveLength(16);
    expect(euclidean(20, 16)).toHaveLength(16);
  });
});

describe("applyEuclidean", () => {
  it("repeats the bar rhythm per bar and only touches the chosen lane", () => {
    const p = applyEuclidean(
      resizePattern(createEmptyPattern(), 2),
      "hhClosed",
      4,
    );
    expect(p.drums.hhClosed.map((s) => s.step)).toEqual([
      0, 4, 8, 12, 16, 20, 24, 28,
    ]);
    expect(p.drums.kick).toEqual([]);
  });
});

describe("generateStyle", () => {
  it.each(STYLE_NAMES)("%s: hits in range, velocities valid, sorted", (name) => {
    const p = generateStyle(resizePattern(createEmptyPattern(), 2), name, seeded(1));
    const hits = allHits(p);
    expect(hits.length).toBeGreaterThan(0);
    for (const h of hits) {
      expect(h.step).toBeGreaterThanOrEqual(0);
      expect(h.step).toBeLessThan(totalSteps(p));
      expect(h.velocity).toBeGreaterThan(0);
      expect(h.velocity).toBeLessThanOrEqual(1);
    }
    for (const lane of DRUM_LANES) {
      const steps = p.drums[lane.id].map((s) => s.step);
      expect(steps).toEqual([...steps].sort((a, b) => a - b));
    }
  });

  it("keeps bpm/bars/bass, and only shuffle changes swing", () => {
    const base = { ...createEmptyPattern(), bpm: 117, swing: 0.2 };
    const rock = generateStyle(base, "rock", seeded(1));
    expect(rock.bpm).toBe(117);
    expect(rock.swing).toBe(0.2);
    expect(generateStyle(base, "shuffle", seeded(1)).swing).toBe(0.65);
  });

  it("is deterministic for a seed, varied across seeds", () => {
    const base = createEmptyPattern();
    const a = generateStyle(base, "funk", seeded(7));
    const b = generateStyle(base, "funk", seeded(7));
    expect(a).toEqual(b);
    const c = generateStyle(base, "funk", seeded(8));
    expect(allHits(a)).not.toEqual(allHits(c));
  });
});

describe("generateFill", () => {
  it("keeps everything before the fill zone and always lands the last hit", () => {
    const base = generateStyle(createEmptyPattern(), "rock", seeded(3));
    const filled = generateFill(base, seeded(3));
    const total = totalSteps(base);
    const zoneStart = total - (seeded(3)() < 0.5 ? 4 : 8);
    for (const lane of DRUM_LANES) {
      expect(filled.drums[lane.id].filter((s) => s.step < zoneStart)).toEqual(
        base.drums[lane.id].filter((s) => s.step < zoneStart),
      );
    }
    const last = allHits(filled).filter((h) => h.step === total - 1);
    expect(last).toHaveLength(1);
    expect(["snare", "tomHigh", "tomMid", "tomLow"]).toContain(last[0].lane);
  });

  it("fill velocities ramp upward within the zone", () => {
    const filled = generateFill(createEmptyPattern(), seeded(5));
    const hits = allHits(filled).sort((a, b) => a.step - b.step);
    expect(hits.length).toBeGreaterThan(1);
    expect(hits[hits.length - 1].velocity).toBeGreaterThan(hits[0].velocity);
  });
});

describe("humanize", () => {
  it("jitters drum velocities within bounds, leaves steps alone", () => {
    const base = generateStyle(createEmptyPattern(), "rock", seeded(1));
    const h = humanizeDrums(base, seeded(2));
    for (const lane of DRUM_LANES) {
      expect(h.drums[lane.id].map((s) => s.step)).toEqual(
        base.drums[lane.id].map((s) => s.step),
      );
      for (let i = 0; i < h.drums[lane.id].length; i++) {
        const dv = Math.abs(
          h.drums[lane.id][i].velocity - base.drums[lane.id][i].velocity,
        );
        expect(dv).toBeLessThanOrEqual(0.08 + 1e-9);
        expect(h.drums[lane.id][i].velocity).toBeGreaterThanOrEqual(0.05);
        expect(h.drums[lane.id][i].velocity).toBeLessThanOrEqual(1);
      }
    }
    expect(allHits(h)).not.toEqual(allHits(base));
  });

  it("humanizeBass touches only bass velocities", () => {
    const base = generateBass(createEmptyPattern(), 33, "roots", seeded(1));
    const h = humanizeBass(base, seeded(3));
    expect(h.drums).toEqual(base.drums);
    expect(h.bass.map((n) => [n.step, n.midiPitch, n.durationSteps])).toEqual(
      base.bass.map((n) => [n.step, n.midiPitch, n.durationSteps]),
    );
    expect(h.bass.map((n) => n.velocity)).not.toEqual(
      base.bass.map((n) => n.velocity),
    );
  });
});

describe("bass tab", () => {
  it("tuning covers exactly the piano-roll range E1–G3", async () => {
    const { BASS_STRINGS, BASS_FRETS, BASS_PITCH_MIN, BASS_PITCH_MAX } =
      await import("./types");
    const pitches = BASS_STRINGS.flatMap((s) =>
      Array.from({ length: BASS_FRETS + 1 }, (_, f) => s.open + f),
    );
    expect(Math.min(...pitches)).toBe(BASS_PITCH_MIN);
    expect(Math.max(...pitches)).toBe(BASS_PITCH_MAX);
    // standard tuning: strings are a fourth apart
    expect(BASS_STRINGS.map((s) => s.open)).toEqual([43, 38, 33, 28]);
  });

  it("tabPosition picks the smallest playable fret and round-trips", async () => {
    const { BASS_STRINGS, tabPosition, BASS_PITCH_MIN, BASS_PITCH_MAX } =
      await import("./types");
    expect(tabPosition(33)).toEqual({ string: 2, fret: 0 }); // A1 = open A
    expect(tabPosition(40)).toEqual({ string: 1, fret: 2 }); // E2 = D string 2
    expect(tabPosition(28)).toEqual({ string: 3, fret: 0 }); // E1 = open E
    expect(tabPosition(55)).toEqual({ string: 0, fret: 12 }); // G3 = G string 12
    for (let p = BASS_PITCH_MIN; p <= BASS_PITCH_MAX; p++) {
      const { string, fret } = tabPosition(p);
      expect(BASS_STRINGS[string].open + fret).toBe(p);
    }
  });
});

describe("generateBass", () => {
  const withKick = () => {
    const p = createEmptyPattern();
    p.drums.kick = [
      { step: 0, velocity: 0.9 },
      { step: 6, velocity: 0.9 },
      { step: 10, velocity: 0.9 },
    ];
    return p;
  };

  it("roots: one note per kick at the root, sustained to the next kick (max quarter)", () => {
    const p = generateBass(withKick(), 33, "roots", seeded(1));
    expect(p.bass.map((n) => [n.step, n.durationSteps, n.midiPitch])).toEqual([
      [0, 4, 33], // gap of 6 capped at 4
      [6, 4, 33],
      [10, 4, 33],
    ]);
  });

  it("rootFifth alternates root and +7", () => {
    const p = generateBass(withKick(), 33, "rootFifth", seeded(1));
    expect(p.bass.map((n) => n.midiPitch)).toEqual([33, 40, 33]);
  });

  it("walking stays in the root-based interval set", () => {
    const p = generateBass(withKick(), 33, "walking", seeded(9));
    for (const n of p.bass) {
      expect([0, 3, 5, 7, 10, 12]).toContain(n.midiPitch - 33);
    }
  });

  it("falls back to quarter-note anchors when there is no kick", () => {
    const p = generateBass(createEmptyPattern(), 30, "roots", seeded(1));
    expect(p.bass.map((n) => n.step)).toEqual([0, 4, 8, 12]);
  });

  it.each(BASS_MODES)("%s: replaces the old line and stays monophonic", (mode) => {
    let base = withKick();
    base = generateBass(base, 40, "roots", seeded(1)); // pre-existing line
    const p = generateBass(base, 33, mode, seeded(2));
    const sorted = [...p.bass].sort((a, b) => a.step - b.step);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].step).toBeGreaterThanOrEqual(
        sorted[i - 1].step + sorted[i - 1].durationSteps,
      );
    }
  });
});
