import { describe, expect, it } from "vitest";
import {
  chordAt,
  chordChanges,
  chordToneNames,
  isChordTone,
  parseBar,
  parseChord,
} from "./chords";
import { createEmptyPattern, resizePattern } from "./pattern";

describe("parseChord", () => {
  it.each([
    ["C", 0, 0, [0, 4, 7]],
    ["Am", 9, 9, [0, 3, 7]],
    ["am", 9, 9, [0, 3, 7]],
    ["Bb7", 10, 10, [0, 4, 7, 10]],
    ["B♭maj7", 10, 10, [0, 4, 7, 11]],
    ["F#m7", 6, 6, [0, 3, 7, 10]],
    ["F♯m7b5", 6, 6, [0, 3, 6, 10]],
    ["Ebdim", 3, 3, [0, 3, 6]],
    ["Gsus4", 7, 7, [0, 5, 7]],
    ["D5", 2, 2, [0, 7]],
    ["C9", 0, 0, [0, 4, 7, 10]],
    ["C/E", 0, 4, [0, 4, 7]],
    ["Am/G", 9, 7, [0, 3, 7]],
    [" Dm ", 2, 2, [0, 3, 7]],
  ])("%s → root %i, bass %i, tones %j", (text, root, bass, intervals) => {
    expect(parseChord(text)).toMatchObject({ root, bass, intervals });
  });

  it.each(["", "H", "Cxyz", "7", "C//E", "C/H", "%"])("can't read %j", (text) => {
    expect(parseChord(text)).toBeNull();
  });
});

describe("chordToneNames", () => {
  it.each([
    ["Gm", "G Bb D"],
    ["E7", "E G# B D"],
    ["Ab", "Ab C Eb"],
    ["F7", "F A C Eb"],
    ["Bdim", "B D F"],
    ["C#m", "C# E G#"],
    ["D7", "D F# A C"],
    ["F♯", "F# A# C#"],
  ])("%s → %s", (symbol, names) => {
    expect(chordToneNames(parseChord(symbol)!).join(" ")).toBe(names);
  });
});

describe("parseBar", () => {
  const offsets = (text: string) =>
    parseBar(text, 16).chords.map((c) => [c.offset, c.chord.symbol]);

  it("splits a bar: whole, halves, 2+1+1 beats, one per beat", () => {
    expect(offsets("")).toEqual([]);
    expect(offsets("Am")).toEqual([[0, "Am"]]);
    expect(offsets("C  G")).toEqual([[0, "C"], [8, "G"]]);
    expect(offsets("C G Am")).toEqual([[0, "C"], [8, "G"], [12, "Am"]]);
    expect(offsets("C D E F")).toEqual([[0, "C"], [4, "D"], [8, "E"], [12, "F"]]);
  });

  it("% holds the previous chord for its slot", () => {
    expect(offsets("C % G %")).toEqual([[0, "C"], [8, "G"]]);
  });

  it("errors name the problem and yield no chords", () => {
    expect(parseBar("C Hx", 16)).toEqual({ chords: [], error: 'Can\'t read "Hx"' });
    expect(parseBar("C D E F G", 16).error).toMatch(/At most 4/);
  });
});

describe("chordChanges / chordAt", () => {
  const pattern = (chords: string[], bars = chords.length) => ({
    ...resizePattern(createEmptyPattern(), bars),
    chords,
  });

  it("collects changes across bars; empty bars add none", () => {
    const changes = chordChanges(pattern(["Am", "", "F G"]));
    expect(changes.map((c) => [c.step, c.chord.symbol])).toEqual([
      [0, "Am"],
      [32, "F"],
      [40, "G"],
    ]);
  });

  it("skips unreadable bars and bars beyond the pattern", () => {
    const changes = chordChanges(pattern(["Am", "Q7", "C", "D"], 3));
    expect(changes.map((c) => c.chord.symbol)).toEqual(["Am", "C"]);
  });

  it("a chord holds until the next; before the first, the last one rings on (loop)", () => {
    const changes = chordChanges(pattern(["", "C G"]));
    expect(chordAt(changes, 0)?.symbol).toBe("G");
    expect(chordAt(changes, 16)?.symbol).toBe("C");
    expect(chordAt(changes, 23)?.symbol).toBe("C");
    expect(chordAt(changes, 24)?.symbol).toBe("G");
    expect(chordAt([], 5)).toBeNull();
  });

  it("isChordTone", () => {
    const am = parseChord("Am")!;
    expect([9, 0, 4].every((pc) => isChordTone(am, pc))).toBe(true);
    expect(isChordTone(am, 7)).toBe(false);
  });
});
