import * as Tone from "tone";
import type { DrumLane } from "../types";
import { DrumKit } from "./kit";

export interface DrumSource {
  trigger(lane: DrumLane, velocity: number, time: number): void;
  dispose(): void;
}

export const KIT_NAMES = ["synth", "acoustic", "CR78", "Kit8"] as const;
export type KitName = (typeof KIT_NAMES)[number];

const SAMPLE_BASE = "https://tonejs.github.io/audio/drum-samples/";
const KIT_DIRS: Record<Exclude<KitName, "synth">, string> = {
  acoustic: "acoustic-kit/",
  CR78: "CR78/",
  Kit8: "Kit8/",
};

// The hosted sets cover the core kit; open hat, crash and ride stay synth.
const SAMPLE_FILES: Partial<Record<DrumLane, string>> = {
  kick: "kick.mp3",
  snare: "snare.mp3",
  hhClosed: "hihat.mp3",
  tomHigh: "tom1.mp3",
  tomMid: "tom2.mp3",
  tomLow: "tom3.mp3",
};

/**
 * Sample-based kit streaming from the Tone.js example set. Until a sample
 * has loaded (or if it never does — offline, for instance) the lane falls
 * back to the synth kit, so switching kits never goes silent.
 */
export class SampledKit implements DrumSource {
  private samplers = new Map<DrumLane, Tone.Sampler>();
  private loaded = new Set<DrumLane>();
  private fallback = new DrumKit();

  constructor(kit: Exclude<KitName, "synth">) {
    const base = SAMPLE_BASE + KIT_DIRS[kit];
    for (const [lane, file] of Object.entries(SAMPLE_FILES) as [
      DrumLane,
      string,
    ][]) {
      const sampler = new Tone.Sampler({
        urls: { C3: file },
        baseUrl: base,
        onload: () => this.loaded.add(lane),
        onerror: (err) =>
          console.warn(`drum sample failed to load: ${base}${file}`, err),
      }).toDestination();
      this.samplers.set(lane, sampler);
    }
  }

  trigger(lane: DrumLane, velocity: number, time: number): void {
    const sampler = this.samplers.get(lane);
    if (sampler && this.loaded.has(lane)) {
      sampler.triggerAttack("C3", time, velocity);
    } else {
      this.fallback.trigger(lane, velocity, time);
    }
  }

  dispose(): void {
    for (const sampler of this.samplers.values()) sampler.dispose();
    this.fallback.dispose();
  }
}

export function createKit(name: KitName): DrumSource {
  return name === "synth" ? new DrumKit() : new SampledKit(name);
}
