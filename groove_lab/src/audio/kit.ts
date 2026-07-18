import * as Tone from "tone";
import type { DrumLane } from "../types";

/**
 * Synthesized drum kit — no samples to load (CLAUDE.md: synth kit first).
 * Every voice hangs off a shared output so a master volume is one knob away.
 */
export class DrumKit {
  private output: Tone.Gain;
  private kick: Tone.MembraneSynth;
  private toms: Record<"tomLow" | "tomMid" | "tomHigh", Tone.MembraneSynth>;
  private snareNoise: Tone.NoiseSynth;
  private snareTone: Tone.MembraneSynth;
  private hhClosed: Tone.NoiseSynth;
  private hhOpen: Tone.NoiseSynth;
  private crash: Tone.MetalSynth;
  private ride: Tone.MetalSynth;

  constructor() {
    this.output = new Tone.Gain(0.9).toDestination();

    this.kick = new Tone.MembraneSynth({
      pitchDecay: 0.05,
      octaves: 6,
      envelope: { attack: 0.001, decay: 0.35, sustain: 0.01, release: 0.4 },
    }).connect(this.output);

    const tom = (pitchDecay: number) =>
      new Tone.MembraneSynth({
        pitchDecay,
        octaves: 3,
        envelope: { attack: 0.001, decay: 0.3, sustain: 0.01, release: 0.3 },
        volume: -4,
      }).connect(this.output);
    this.toms = { tomLow: tom(0.1), tomMid: tom(0.08), tomHigh: tom(0.06) };

    // Snare = noise burst + a short pitched thump underneath.
    this.snareNoise = new Tone.NoiseSynth({
      noise: { type: "white" },
      envelope: { attack: 0.001, decay: 0.13, sustain: 0 },
      volume: -6,
    });
    this.snareNoise.chain(new Tone.Filter(1800, "highpass"), this.output);
    this.snareTone = new Tone.MembraneSynth({
      pitchDecay: 0.02,
      octaves: 2,
      envelope: { attack: 0.001, decay: 0.08, sustain: 0 },
      volume: -10,
    }).connect(this.output);

    const hat = (decay: number, volume: number) => {
      const synth = new Tone.NoiseSynth({
        noise: { type: "white" },
        envelope: { attack: 0.001, decay, sustain: 0 },
        volume,
      });
      synth.connect(new Tone.Filter(8000, "highpass").connect(this.output));
      return synth;
    };
    this.hhClosed = hat(0.045, -14);
    this.hhOpen = hat(0.35, -16);

    const cymbal = (decay: number, volume: number) => {
      const synth = new Tone.MetalSynth({
        envelope: { attack: 0.001, decay, release: decay },
        harmonicity: 5.1,
        modulationIndex: 32,
        resonance: 4000,
        octaves: 1.5,
        volume,
      });
      synth.connect(this.output);
      return synth;
    };
    this.crash = cymbal(1.4, -18);
    this.ride = cymbal(0.7, -20);
  }

  trigger(lane: DrumLane, velocity: number, time: number): void {
    switch (lane) {
      case "kick":
        this.kick.triggerAttackRelease("C1", "8n", time, velocity);
        break;
      case "snare":
        this.snareNoise.triggerAttackRelease("16n", time, velocity);
        this.snareTone.triggerAttackRelease("G2", "16n", time, velocity * 0.7);
        break;
      case "hhClosed":
        this.hhClosed.triggerAttackRelease("32n", time, velocity);
        break;
      case "hhOpen":
        this.hhOpen.triggerAttackRelease("8n", time, velocity);
        break;
      case "tomLow":
        this.toms.tomLow.triggerAttackRelease("G2", "8n", time, velocity);
        break;
      case "tomMid":
        this.toms.tomMid.triggerAttackRelease("B2", "8n", time, velocity);
        break;
      case "tomHigh":
        this.toms.tomHigh.triggerAttackRelease("D3", "8n", time, velocity);
        break;
      case "crash":
        this.crash.triggerAttackRelease("C4", "2n", time, velocity * 0.8);
        break;
      case "ride":
        this.ride.triggerAttackRelease("D4", "4n", time, velocity * 0.8);
        break;
    }
  }

  dispose(): void {
    this.output.dispose();
    this.kick.dispose();
    Object.values(this.toms).forEach((t) => t.dispose());
    this.snareNoise.dispose();
    this.snareTone.dispose();
    this.hhClosed.dispose();
    this.hhOpen.dispose();
    this.crash.dispose();
    this.ride.dispose();
  }
}
