import * as Tone from "tone";

/** Monophonic synth bass (CLAUDE.md: MonoSynth, samples later). */
export class BassSynth {
  private synth: Tone.MonoSynth;
  private lastTime = 0;

  constructor() {
    this.synth = new Tone.MonoSynth({
      oscillator: { type: "sawtooth" },
      envelope: { attack: 0.005, decay: 0.1, sustain: 0.9, release: 0.1 },
      filter: { Q: 2, type: "lowpass", rolloff: -24 },
      filterEnvelope: {
        attack: 0.005,
        decay: 0.15,
        sustain: 0.4,
        release: 0.2,
        baseFrequency: 80,
        octaves: 2.8,
      },
      volume: -6,
    }).toDestination();
  }

  trigger(
    midiPitch: number,
    durationSeconds: number,
    velocity: number,
    time: number,
  ): void {
    const freq = Tone.Frequency(midiPitch, "midi").toFrequency();
    // MonoSynth requires strictly increasing start times; rapid previews
    // (typing fret numbers) can land on the same timestamp.
    if (time <= this.lastTime) time = this.lastTime + 0.005;
    this.lastTime = time;
    // Slight gap so back-to-back notes retrigger instead of gluing together.
    this.synth.triggerAttackRelease(
      freq,
      durationSeconds * 0.9,
      time,
      velocity,
    );
  }

  release(): void {
    this.synth.triggerRelease(Tone.now());
  }

  dispose(): void {
    this.synth.dispose();
  }
}
