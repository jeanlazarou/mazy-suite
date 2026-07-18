export type DrumLane =
  | "kick"
  | "snare"
  | "hhClosed"
  | "hhOpen"
  | "tomLow"
  | "tomMid"
  | "tomHigh"
  | "crash"
  | "ride";

export interface Step {
  step: number;
  velocity: number; // 0–1
}

export interface BassNote {
  step: number;
  durationSteps: number;
  midiPitch: number;
  velocity: number;
  /** Tab fingering hint: index into BASS_STRINGS. Display only — playback
   *  and export use midiPitch. Absent on notes not entered via tab. */
  string?: number;
}

export interface Pattern {
  bpm: number;
  bars: number;
  stepsPerBar: number; // 16 = sixteenth-note grid
  swing: number; // 0–1
  drums: Record<DrumLane, Step[]>;
  bass: BassNote[];
}

export interface DrumLaneInfo {
  id: DrumLane;
  label: string;
  gmNote: number; // General MIDI percussion number, channel 10
}

// Display order: top of the grid to bottom (cymbals down to kick).
export const DRUM_LANES: DrumLaneInfo[] = [
  { id: "crash", label: "Crash", gmNote: 49 },
  { id: "ride", label: "Ride", gmNote: 51 },
  { id: "hhOpen", label: "Open Hat", gmNote: 46 },
  { id: "hhClosed", label: "Closed Hat", gmNote: 42 },
  { id: "tomHigh", label: "High Tom", gmNote: 50 },
  { id: "tomMid", label: "Mid Tom", gmNote: 47 },
  { id: "tomLow", label: "Low Tom", gmNote: 45 },
  { id: "snare", label: "Snare", gmNote: 38 },
  { id: "kick", label: "Kick", gmNote: 36 },
];

export interface Section {
  id: string;
  name: string; // "A", "B", …
  pattern: Pattern;
}

/**
 * A song: unique sections plus a play order referencing them (A A B A…).
 * Editing a section edits every occurrence in the arrangement.
 */
export interface Song {
  sections: Section[];
  arrangement: string[]; // section ids
}

export function totalSteps(pattern: Pattern): number {
  return pattern.bars * pattern.stepsPerBar;
}

// Piano-roll range: a 4-string bass, open E string (E1) up to G3.
export const BASS_PITCH_MIN = 28; // E1
export const BASS_PITCH_MAX = 55; // G3

const NOTE_NAMES = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
] as const;

export function midiToNoteName(midi: number): string {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

export function isSharpPitch(midi: number): boolean {
  return NOTE_NAMES[midi % 12].includes("#");
}

// 4-string bass, standard tuning, highest string first (tab orientation).
export const BASS_STRINGS = [
  { name: "G", open: 43 },
  { name: "D", open: 38 },
  { name: "A", open: 33 },
  { name: "E", open: 28 },
] as const;

export const BASS_FRETS = 12; // G string fret 12 = G3 = BASS_PITCH_MAX

/**
 * Where to display a pitch in tab: the highest string that reaches it, i.e.
 * the smallest fret (A1 → A string fret 0, not E string fret 5).
 */
export function tabPosition(
  midiPitch: number,
): { string: number; fret: number } {
  for (let i = 0; i < BASS_STRINGS.length; i++) {
    const fret = midiPitch - BASS_STRINGS[i].open;
    if (fret >= 0 && fret <= BASS_FRETS) return { string: i, fret };
  }
  const last = BASS_STRINGS.length - 1;
  return {
    string: last,
    fret: Math.max(0, Math.min(BASS_FRETS, midiPitch - BASS_STRINGS[last].open)),
  };
}
