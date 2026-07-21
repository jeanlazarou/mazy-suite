import type { DrumLane, Pattern, Step } from "./types";
import { totalSteps } from "./types";
import { addBassNote, clearBass } from "./pattern";

export type Rng = () => number; // 0 ≤ rng() < 1, injectable for seeded tests

// ---- style templates ----
// Templates describe one 16-step bar; hits with prob < 1 are rolled per bar,
// so repeated Generate clicks give usable variations of the same style.

interface TemplateHit {
  step: number;
  velocity: number;
  prob?: number;
}

interface StyleTemplate {
  swing?: number; // set on the pattern when the style implies it
  lanes: Partial<Record<DrumLane, TemplateHit[]>>;
}

function offbeatHats(accent: number, tick: number): TemplateHit[] {
  return Array.from({ length: 8 }, (_, i) => ({
    step: i * 2,
    velocity: i % 2 === 0 ? accent : tick,
  }));
}

export const STYLES = {
  rock: {
    lanes: {
      kick: [
        { step: 0, velocity: 0.95 },
        { step: 8, velocity: 0.9 },
        { step: 10, velocity: 0.85, prob: 0.7 },
        { step: 7, velocity: 0.6, prob: 0.25 },
      ],
      snare: [
        { step: 4, velocity: 0.9 },
        { step: 12, velocity: 0.9 },
        { step: 14, velocity: 0.4, prob: 0.25 },
      ],
      hhClosed: offbeatHats(0.8, 0.55),
      crash: [{ step: 0, velocity: 0.7, prob: 0.15 }],
    },
  },
  funk: {
    lanes: {
      kick: [
        { step: 0, velocity: 0.95 },
        { step: 2, velocity: 0.7, prob: 0.5 },
        { step: 7, velocity: 0.85 },
        { step: 10, velocity: 0.8 },
        { step: 13, velocity: 0.6, prob: 0.4 },
      ],
      snare: [
        { step: 4, velocity: 0.9 },
        { step: 12, velocity: 0.9 },
        { step: 6, velocity: 0.35, prob: 0.5 },
        { step: 15, velocity: 0.35, prob: 0.4 },
      ],
      hhClosed: Array.from({ length: 16 }, (_, step) => ({
        step,
        velocity: step % 4 === 0 ? 0.8 : step % 2 === 0 ? 0.55 : 0.45,
      })),
      hhOpen: [{ step: 14, velocity: 0.7, prob: 0.5 }],
    },
  },
  disco: {
    lanes: {
      kick: [0, 4, 8, 12].map((step) => ({ step, velocity: 0.95 })),
      snare: [
        { step: 4, velocity: 0.85 },
        { step: 12, velocity: 0.85 },
      ],
      hhClosed: [0, 4, 8, 12].map((step) => ({ step, velocity: 0.6 })),
      hhOpen: [2, 6, 10, 14].map((step) => ({ step, velocity: 0.8 })),
    },
  },
  shuffle: {
    swing: 0.65,
    lanes: {
      kick: [
        { step: 0, velocity: 0.95 },
        { step: 8, velocity: 0.9 },
        { step: 11, velocity: 0.7, prob: 0.4 },
      ],
      snare: [
        { step: 4, velocity: 0.9 },
        { step: 12, velocity: 0.9 },
      ],
      ride: offbeatHats(0.75, 0.5),
    },
  },
  hardRock: {
    lanes: {
      kick: [
        { step: 0, velocity: 0.95 },
        { step: 6, velocity: 0.8, prob: 0.5 },
        { step: 8, velocity: 0.9 },
        { step: 10, velocity: 0.75, prob: 0.6 },
        { step: 14, velocity: 0.7, prob: 0.35 },
      ],
      snare: [
        { step: 4, velocity: 1 },
        { step: 12, velocity: 1 },
        { step: 10, velocity: 0.3, prob: 0.2 },
      ],
      ride: offbeatHats(0.9, 0.65),
      crash: [{ step: 0, velocity: 0.85, prob: 0.4 }],
    },
  },
  rockHalfTime: {
    lanes: {
      kick: [
        { step: 0, velocity: 0.95 },
        { step: 6, velocity: 0.8, prob: 0.6 },
        { step: 10, velocity: 0.6, prob: 0.3 },
      ],
      snare: [{ step: 8, velocity: 1 }],
      hhClosed: [0, 4, 8, 12].map((step) => ({ step, velocity: 0.6 })),
      crash: [{ step: 0, velocity: 0.75, prob: 0.3 }],
    },
  },
  rockArena: {
    lanes: {
      kick: [
        { step: 0, velocity: 0.9 },
        { step: 4, velocity: 0.9 },
        { step: 8, velocity: 0.9 },
        { step: 12, velocity: 0.9 },
        { step: 14, velocity: 0.6, prob: 0.3 },
      ],
      snare: [
        { step: 4, velocity: 0.95 },
        { step: 12, velocity: 0.95 },
      ],
      ride: offbeatHats(0.85, 0.6),
      crash: [
        { step: 0, velocity: 0.9 },
        { step: 8, velocity: 0.6, prob: 0.3 },
      ],
    },
  },
  jazz: {
    swing: 0.6,
    lanes: {
      kick: [
        { step: 0, velocity: 0.5, prob: 0.3 },
        { step: 8, velocity: 0.45, prob: 0.25 },
        { step: 10, velocity: 0.4, prob: 0.15 },
      ],
      snare: [
        { step: 6, velocity: 0.35, prob: 0.3 },
        { step: 11, velocity: 0.3, prob: 0.25 },
        { step: 14, velocity: 0.4, prob: 0.2 },
      ],
      hhClosed: [
        { step: 4, velocity: 0.5 },
        { step: 12, velocity: 0.5 },
      ],
      ride: [
        { step: 0, velocity: 0.8 },
        { step: 4, velocity: 0.6 },
        { step: 6, velocity: 0.7 },
        { step: 8, velocity: 0.8 },
        { step: 12, velocity: 0.6 },
        { step: 14, velocity: 0.7 },
      ],
    },
  },
  // Maqsum rhythm (dum-tak-tak-dum-tak): conga carries the low "dum" (GM Low
  // Conga, 64), snare stands in for the "tak" slap, tambourine (GM 54) gives
  // the riq's steady sizzle. A fuller oriental flavour also wants a
  // phrygian-dominant bass scale, which generateBass() doesn't offer yet.
  oriental: {
    lanes: {
      conga: [
        { step: 0, velocity: 0.95 },
        { step: 10, velocity: 0.85 },
      ],
      snare: [
        { step: 2, velocity: 0.65 },
        { step: 6, velocity: 0.6 },
        { step: 14, velocity: 0.7 },
      ],
      tambourine: Array.from({ length: 16 }, (_, step) => ({
        step,
        velocity: step % 4 === 0 ? 0.5 : 0.3,
      })),
    },
  },
} satisfies Record<string, StyleTemplate>;

export type StyleName = keyof typeof STYLES;
export const STYLE_NAMES = Object.keys(STYLES) as StyleName[];

/** Replace the drums (and swing, if the style implies one) from a template. */
export function generateStyle(
  pattern: Pattern,
  style: StyleName,
  rng: Rng = Math.random,
): Pattern {
  const template: StyleTemplate = STYLES[style];
  const drums = {} as Record<DrumLane, Step[]>;
  for (const lane of Object.keys(pattern.drums) as DrumLane[]) {
    const hits: Step[] = [];
    for (let bar = 0; bar < pattern.bars; bar++) {
      for (const hit of template.lanes[lane] ?? []) {
        if (hit.step >= pattern.stepsPerBar) continue;
        if (hit.prob !== undefined && rng() >= hit.prob) continue;
        hits.push({
          step: bar * pattern.stepsPerBar + hit.step,
          velocity: hit.velocity,
        });
      }
    }
    drums[lane] = hits.sort((a, b) => a.step - b.step);
  }
  return { ...pattern, drums, swing: template.swing ?? pattern.swing };
}

// ---- Euclidean rhythms ----

/**
 * Bjorklund's algorithm: distribute `pulses` as evenly as possible over
 * `steps`. Returns the canonical form (E(3,8) → [0,3,6]), rotated left by
 * `rotation`.
 */
export function euclidean(
  pulses: number,
  steps: number,
  rotation = 0,
): number[] {
  if (steps <= 0 || pulses <= 0) return [];
  if (pulses >= steps) return Array.from({ length: steps }, (_, i) => i);
  let a: number[][] = Array.from({ length: pulses }, () => [1]);
  let b: number[][] = Array.from({ length: steps - pulses }, () => [0]);
  while (b.length > 1) {
    const n = Math.min(a.length, b.length);
    const merged = Array.from({ length: n }, (_, i) => [...a[i], ...b[i]]);
    const rest = a.length > n ? a.slice(n) : b.slice(n);
    a = merged;
    b = rest;
  }
  const flat = [...a, ...b].flat();
  const out: number[] = [];
  for (let i = 0; i < steps; i++) {
    if (flat[(((i + rotation) % steps) + steps) % steps] === 1) out.push(i);
  }
  return out;
}

/**
 * Replace one lane with a Euclidean rhythm, one bar's worth repeated each bar.
 * `pulses` doubles as the lane's density knob.
 */
export function applyEuclidean(
  pattern: Pattern,
  lane: DrumLane,
  pulses: number,
  rotation = 0,
): Pattern {
  const barSteps = euclidean(pulses, pattern.stepsPerBar, rotation);
  const hits: Step[] = [];
  for (let bar = 0; bar < pattern.bars; bar++) {
    for (const step of barSteps) {
      hits.push({
        step: bar * pattern.stepsPerBar + step,
        velocity: step % 4 === 0 ? 0.9 : 0.7,
      });
    }
  }
  return { ...pattern, drums: { ...pattern.drums, [lane]: hits } };
}

// ---- fill generator ----

const FILL_RUN: DrumLane[] = ["snare", "tomHigh", "tomMid", "tomLow"];

/**
 * Replace the tail of the pattern (last 4 or 8 sixteenths) with a fill:
 * a descending snare→toms run with rising velocity. Everything in the fill
 * zone is cleared first — hats stopping is part of the effect.
 */
export function generateFill(
  pattern: Pattern,
  rng: Rng = Math.random,
): Pattern {
  const total = totalSteps(pattern);
  const zoneLen = Math.min(rng() < 0.5 ? 4 : 8, total);
  const zoneStart = total - zoneLen;
  const drums = {} as Record<DrumLane, Step[]>;
  for (const lane of Object.keys(pattern.drums) as DrumLane[]) {
    drums[lane] = pattern.drums[lane].filter((s) => s.step < zoneStart);
  }
  for (let step = zoneStart; step < total; step++) {
    const progress = (step - zoneStart) / zoneLen;
    const isLast = step === total - 1;
    if (!isLast && rng() > 0.85) continue; // breathing room, but always land the last hit
    const bump = rng() < 0.25 ? 1 : 0;
    const lane =
      FILL_RUN[
        Math.min(FILL_RUN.length - 1, Math.floor(progress * FILL_RUN.length) + bump)
      ];
    drums[lane].push({ step, velocity: 0.6 + progress * 0.4 });
  }
  return { ...pattern, drums };
}

// ---- humanize ----

const HUMANIZE_AMOUNT = 0.08;
const VELOCITY_FLOOR = 0.05;

function jitter(velocity: number, rng: Rng): number {
  const v = velocity + (rng() * 2 - 1) * HUMANIZE_AMOUNT;
  return Math.min(1, Math.max(VELOCITY_FLOOR, v));
}

/** Spread drum velocities a little so the groove stops sounding robotic. */
export function humanizeDrums(pattern: Pattern, rng: Rng = Math.random): Pattern {
  const drums = {} as Record<DrumLane, Step[]>;
  for (const lane of Object.keys(pattern.drums) as DrumLane[]) {
    drums[lane] = pattern.drums[lane].map((s) => ({
      ...s,
      velocity: jitter(s.velocity, rng),
    }));
  }
  return { ...pattern, drums };
}

export function humanizeBass(pattern: Pattern, rng: Rng = Math.random): Pattern {
  return {
    ...pattern,
    bass: pattern.bass.map((n) => ({ ...n, velocity: jitter(n.velocity, rng) })),
  };
}

// ---- bass from the kick ----

export const BASS_MODES = ["roots", "rootFifth", "walking"] as const;
export type BassMode = (typeof BASS_MODES)[number];

// Intervals for "walking-ish": root-heavy minor pentatonic flavours.
const WALK_INTERVALS = [0, 0, 3, 5, 7, 10, 12];

/**
 * Generate a bass line locked to the kick rhythm (or to the quarter-note
 * beats when there is no kick). Notes sustain to the next anchor, capped at
 * a quarter note.
 */
export function generateBass(
  pattern: Pattern,
  root: number,
  mode: BassMode,
  rng: Rng = Math.random,
): Pattern {
  const total = totalSteps(pattern);
  let anchors = pattern.drums.kick.map((s) => s.step).sort((a, b) => a - b);
  if (anchors.length === 0) {
    anchors = [];
    for (let s = 0; s < total; s += 4) anchors.push(s);
  }
  let result = clearBass(pattern);
  for (let i = 0; i < anchors.length; i++) {
    const step = anchors[i];
    const next = anchors[i + 1] ?? total;
    const durationSteps = Math.max(1, Math.min(4, next - step));
    let interval = 0;
    if (mode === "rootFifth") interval = i % 2 === 1 ? 7 : 0;
    if (mode === "walking") {
      interval = WALK_INTERVALS[Math.floor(rng() * WALK_INTERVALS.length)];
    }
    result = addBassNote(result, {
      step,
      durationSteps,
      midiPitch: root + interval,
      velocity: step % pattern.stepsPerBar === 0 ? 0.9 : 0.75,
    });
  }
  return result;
}
