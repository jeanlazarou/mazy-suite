import type { Pattern } from "./types";

// Chords are stored as typed (Pattern.chords: one text per bar) and parsed
// here when needed — the text is the input, everything else derives from it.

export interface Chord {
  symbol: string; // as typed, trimmed
  rootName: string; // "Bb", "F#", "C"
  root: number; // pitch class 0–11
  bass: number; // pitch class the bass should play: slash note, else root
  intervals: number[]; // semitones above the root, starting with 0
}

export interface ChordChange {
  step: number;
  chord: Chord;
}

const LETTERS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// Suffix → chord tones. Extensions (9, 11, 13, add9) only colour the chord;
// for a bass line the triad/seventh underneath is what matters.
const QUALITIES: [string[], number[]][] = [
  [["", "M", "maj", "add9", "add2"], [0, 4, 7]],
  [["m", "min", "-", "madd9"], [0, 3, 7]],
  [["7", "9", "11", "13"], [0, 4, 7, 10]],
  [["maj7", "M7", "Δ", "Δ7", "maj9", "M9"], [0, 4, 7, 11]],
  [["m7", "min7", "-7", "m9", "m11"], [0, 3, 7, 10]],
  [["6"], [0, 4, 7, 9]],
  [["m6"], [0, 3, 7, 9]],
  [["dim", "°", "o"], [0, 3, 6]],
  [["dim7", "°7", "o7"], [0, 3, 6, 9]],
  [["m7b5", "ø", "ø7", "-7b5"], [0, 3, 6, 10]],
  [["aug", "+"], [0, 4, 8]],
  [["sus4", "sus"], [0, 5, 7]],
  [["sus2"], [0, 2, 7]],
  [["7sus4", "7sus"], [0, 5, 7, 10]],
  [["5"], [0, 7]],
];
const SUFFIXES = new Map(
  QUALITIES.flatMap(([names, intervals]) =>
    names.map((name) => [name, intervals] as const),
  ),
);

const CHORD_RE = /^([A-Ga-g])([#b♯♭]?)([^/]*)(?:\/([A-Ga-g])([#b♯♭]?))?$/;

function pitchClass(letter: string, accidental: string): number {
  const shift = /[#♯]/.test(accidental) ? 1 : /[b♭]/.test(accidental) ? -1 : 0;
  return (LETTERS[letter.toUpperCase()] + shift + 12) % 12;
}

function noteName(letter: string, accidental: string): string {
  return letter.toUpperCase() + accidental.replace("♯", "#").replace("♭", "b");
}

/** "Am", "Bb7", "F#m7b5", "C/E" → Chord; anything unreadable → null. */
export function parseChord(text: string): Chord | null {
  const symbol = text.trim();
  const m = CHORD_RE.exec(symbol);
  if (!m) return null;
  const intervals = SUFFIXES.get(m[3]);
  if (!intervals) return null;
  const root = pitchClass(m[1], m[2]);
  return {
    symbol,
    rootName: noteName(m[1], m[2]),
    root,
    bass: m[4] ? pitchClass(m[4], m[5]) : root,
    intervals: [...intervals],
  };
}

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

/** Chord tones spelled for reading: Gm → G Bb D, E7 → E G# B D. */
export function chordToneNames(chord: Chord): string[] {
  const flatKey = chord.rootName.endsWith("b") || chord.rootName === "F";
  return chord.intervals.map((iv, i) => {
    if (i === 0) return chord.rootName;
    const flat = flatKey || [1, 3, 6, 8, 10].includes(iv % 12);
    return (flat ? FLAT_NAMES : SHARP_NAMES)[(chord.root + iv) % 12];
  });
}

// Where the chords of one bar start, in beats (4/4): one chord = whole bar,
// two = half each, three = 2+1+1, four = one per beat.
const SPLITS: Record<number, number[]> = {
  1: [0],
  2: [0, 2],
  3: [0, 2, 3],
  4: [0, 1, 2, 3],
};

export const MAX_CHORDS_PER_BAR = 4;

/**
 * One bar's text → its chords with their offset in steps. "%" holds the
 * previous chord for its slot. An error names the first unreadable part.
 */
export function parseBar(
  text: string,
  stepsPerBar: number,
): { chords: { offset: number; chord: Chord }[]; error: string | null } {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length > MAX_CHORDS_PER_BAR) {
    return { chords: [], error: `At most ${MAX_CHORDS_PER_BAR} chords in a bar` };
  }
  const beatSteps = stepsPerBar / 4;
  const offsets = SPLITS[tokens.length] ?? [];
  const chords: { offset: number; chord: Chord }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === "%") continue;
    const chord = parseChord(tokens[i]);
    if (!chord) return { chords: [], error: `Can't read "${tokens[i]}"` };
    chords.push({ offset: Math.round(offsets[i] * beatSteps), chord });
  }
  return { chords, error: null };
}

/** Every chord change of the section in order; unreadable bars add none. */
export function chordChanges(pattern: Pattern): ChordChange[] {
  const out: ChordChange[] = [];
  const bars = pattern.chords ?? [];
  for (let bar = 0; bar < Math.min(bars.length, pattern.bars); bar++) {
    const { chords, error } = parseBar(bars[bar] ?? "", pattern.stepsPerBar);
    if (error) continue;
    for (const { offset, chord } of chords) {
      out.push({ step: bar * pattern.stepsPerBar + offset, chord });
    }
  }
  return out;
}

/**
 * The chord sounding at a step: the last change at or before it. Before the
 * first change it's the section's last chord — a section loops, so its last
 * chord rings on into bar 1.
 */
export function chordAt(changes: ChordChange[], step: number): Chord | null {
  if (changes.length === 0) return null;
  let current = changes[changes.length - 1].chord;
  for (const change of changes) {
    if (change.step > step) break;
    current = change.chord;
  }
  return current;
}

/** True when the pitch class is one of the chord's tones. */
export function isChordTone(chord: Chord, pc: number): boolean {
  return chord.intervals.some((iv) => (chord.root + iv) % 12 === pc);
}
