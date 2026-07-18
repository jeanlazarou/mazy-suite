import { afterEach, describe, expect, it, vi } from "vitest";
import { Midi } from "@tonejs/midi";
import { patternToMidi, songToMidi } from "./midi";
import { addBassNote, createDefaultPattern, createEmptyPattern } from "./pattern";
import { totalSteps } from "./types";
import type { Pattern } from "./types";

function parse(pattern: Pattern): Midi {
  const bytes = patternToMidi(pattern);
  expect(bytes).not.toBeNull();
  return new Midi(bytes!);
}

afterEach(() => vi.restoreAllMocks());

describe("patternToMidi — happy path", () => {
  it("round-trips the default pattern: drums on channel 10, bass program 33", () => {
    const midi = parse(createDefaultPattern());
    expect(midi.tracks).toHaveLength(2);
    const [drums, bass] = midi.tracks;
    expect(drums.channel).toBe(9);
    expect(bass.channel).not.toBe(9);
    expect(bass.instrument.number).toBe(33);
    expect(drums.notes.length).toBeGreaterThan(0);
    expect(bass.notes.length).toBe(3);
  });

  it("uses GM percussion numbers and sixteenth-grid ticks", () => {
    const p = createDefaultPattern(); // kick on steps 0, 8, 10
    const midi = parse(p);
    const ppq = midi.header.ppq;
    const kicks = midi.tracks[0].notes.filter((n) => n.midi === 36);
    expect(kicks.map((n) => n.ticks)).toEqual([0, 8, 10].map((s) => (s * ppq) / 4));
    const snares = midi.tracks[0].notes.filter((n) => n.midi === 38);
    expect(snares.map((n) => n.ticks)).toEqual([4, 12].map((s) => (s * ppq) / 4));
  });

  it("sets the tempo from bpm", () => {
    const midi = parse({ ...createDefaultPattern(), bpm: 137 });
    expect(midi.header.tempos[0]?.bpm).toBeCloseTo(137, 1);
  });

  it("bakes swing into off-beat sixteenths only", () => {
    let p = createEmptyPattern();
    p = { ...p, swing: 1 };
    p.drums.hhClosed = [
      { step: 0, velocity: 0.8 },
      { step: 1, velocity: 0.8 },
    ];
    const midi = parse(p);
    const ppq = midi.header.ppq;
    const [even, odd] = midi.tracks[0].notes;
    expect(even.ticks).toBe(0);
    expect(odd.ticks).toBe(Math.round(ppq / 4 + ppq / 4 / 3));
  });

  it("bass note duration spans durationSteps, clipped at pattern end", () => {
    let p = createEmptyPattern(); // 16 steps
    p = addBassNote(p, { step: 4, durationSteps: 2, midiPitch: 33 });
    const midi = parse(p);
    const ppq = midi.header.ppq;
    expect(midi.tracks[1].notes[0].durationTicks).toBe((2 * ppq) / 4);
  });

  it("an empty pattern renders a valid file with two empty tracks", () => {
    const midi = parse(createEmptyPattern());
    expect(midi.tracks.flatMap((t) => t.notes)).toHaveLength(0);
  });
});

describe("songToMidi — chained sections", () => {
  it("offsets each section by the previous ones and emits tempo changes", () => {
    const a = createDefaultPattern(); // bpm 100, kick at 0
    const b = { ...createDefaultPattern(), bpm: 140 };
    const bytes = songToMidi([a, b]);
    expect(bytes).not.toBeNull();
    const midi = new Midi(bytes!);
    const ppq = midi.header.ppq;
    const sectionTicks = totalSteps(a) * (ppq / 4);
    const kicks = midi.tracks[0].notes.filter((n) => n.midi === 36);
    expect(kicks.some((n) => n.ticks === 0)).toBe(true);
    expect(kicks.some((n) => n.ticks === sectionTicks)).toBe(true);
    expect(midi.header.tempos.map((t) => [t.ticks, Math.round(t.bpm)])).toEqual([
      [0, 100],
      [sectionTicks, 140],
    ]);
  });

  it("no tempo event when consecutive sections share a bpm", () => {
    const a = createDefaultPattern();
    const midi = new Midi(songToMidi([a, a])!);
    expect(midi.header.tempos).toHaveLength(1);
  });

  it("empty song → null, one bad section poisons the whole render", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(songToMidi([])).toBeNull();
    expect(
      songToMidi([createDefaultPattern(), { ...createDefaultPattern(), bpm: 0 }]),
    ).toBeNull();
    expect(warn).toHaveBeenCalled();
  });
});

describe("patternToMidi — contract: unrenderable returns null, never throws", () => {
  it.each([
    ["garbage object", {} as Pattern],
    ["null-ish", null as unknown as Pattern],
    ["bpm 0", { ...createDefaultPattern(), bpm: 0 }],
    ["bpm NaN", { ...createDefaultPattern(), bpm: NaN }],
    ["bars 0", { ...createDefaultPattern(), bars: 0 }],
    ["fractional stepsPerBar", { ...createDefaultPattern(), stepsPerBar: 1.5 }],
  ])("%s → null and a logged warning", (_name, pattern) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => {
      expect(patternToMidi(pattern)).toBeNull();
    }).not.toThrow();
    expect(warn).toHaveBeenCalled(); // §3: never silently swallow
  });

  it("skips broken notes instead of failing the file", () => {
    const p = createEmptyPattern();
    p.drums.kick = [
      { step: 0, velocity: 0.9 },
      { step: 99, velocity: 0.9 }, // out of range
      { step: 2, velocity: NaN }, // broken velocity
    ];
    p.bass = [
      { step: 0, durationSteps: 2, midiPitch: 300, velocity: 0.8 }, // bad pitch
      { step: 4, durationSteps: 2, midiPitch: 33, velocity: 0.8 },
    ];
    const midi = parse(p);
    expect(midi.tracks[0].notes).toHaveLength(1);
    expect(midi.tracks[1].notes).toHaveLength(1);
  });

  it("clamps out-of-range but finite velocity", () => {
    const p = createEmptyPattern();
    p.drums.kick = [{ step: 0, velocity: 3 }];
    const midi = parse(p);
    expect(midi.tracks[0].notes[0].velocity).toBeCloseTo(1);
  });
});
