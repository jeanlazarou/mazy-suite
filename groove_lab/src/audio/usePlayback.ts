import { useCallback, useEffect, useRef, useState } from "react";
import * as Tone from "tone";
import type { DrumLane, Pattern } from "../types";
import { DRUM_LANES, totalSteps } from "../types";
import { BassSynth } from "./bassSynth";
import type { DrumSource, KitName } from "./sampledKit";
import { createKit } from "./sampledKit";

export interface PlayPosition {
  index: number; // which pattern in the chain
  step: number; // step within that pattern
}

/**
 * Drives the Tone.js Transport from a chain of patterns (one = loop a
 * section, several = play the arrangement). The chain is re-read through
 * `getPatterns` on every scheduled tick, so grid edits are audible on the
 * next step without restarting playback, and each section's bpm/swing apply
 * as the playhead enters it.
 */
export function usePlayback(getPatterns: () => Pattern[], kitName: KitName) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState<PlayPosition | null>(null);

  const getPatternsRef = useRef(getPatterns);
  getPatternsRef.current = getPatterns;

  const kitRef = useRef<DrumSource | null>(null);
  const kitNameRef = useRef(kitName);
  const bassRef = useRef<BassSynth | null>(null);
  const stepCounterRef = useRef(0);
  const scheduleIdRef = useRef<number | null>(null);

  // Swap the kit live; if none exists yet it's created lazily on first use.
  useEffect(() => {
    kitNameRef.current = kitName;
    if (kitRef.current) {
      kitRef.current.dispose();
      kitRef.current = createKit(kitName);
    }
  }, [kitName]);

  useEffect(() => {
    return () => {
      const transport = Tone.getTransport();
      transport.stop();
      transport.cancel();
      kitRef.current?.dispose();
      kitRef.current = null;
      bassRef.current?.dispose();
      bassRef.current = null;
    };
  }, []);

  const start = useCallback(async () => {
    await Tone.start(); // must happen in a user gesture
    kitRef.current ??= createKit(kitNameRef.current);
    bassRef.current ??= new BassSynth();

    const transport = Tone.getTransport();
    const first = getPatternsRef.current()[0];
    if (!first) return;
    transport.bpm.value = first.bpm;
    stepCounterRef.current = 0;

    scheduleIdRef.current = transport.scheduleRepeat((time) => {
      const patterns = getPatternsRef.current();
      if (patterns.length === 0) return;
      const total = patterns.reduce((sum, p) => sum + totalSteps(p), 0);
      let count = stepCounterRef.current % total;
      stepCounterRef.current += 1;

      let index = 0;
      while (count >= totalSteps(patterns[index])) {
        count -= totalSteps(patterns[index]);
        index += 1;
      }
      const p = patterns[index];
      const step = count;

      // The section owns tempo; apply on entry (and on live BPM edits).
      if (transport.bpm.value !== p.bpm) transport.bpm.value = p.bpm;

      // Swing: push every off-beat sixteenth late, up to a triplet feel.
      const sixteenth = Tone.Time("16n").toSeconds();
      const swungTime =
        step % 2 === 1 ? time + p.swing * (sixteenth / 3) : time;

      for (const lane of DRUM_LANES) {
        const hit = p.drums[lane.id].find((s) => s.step === step);
        if (hit) kitRef.current?.trigger(lane.id, hit.velocity, swungTime);
      }

      for (const note of p.bass) {
        if (note.step === step) {
          bassRef.current?.trigger(
            note.midiPitch,
            note.durationSteps * sixteenth,
            note.velocity,
            swungTime,
          );
        }
      }

      Tone.getDraw().schedule(() => setPosition({ index, step }), time);
    }, "16n");

    transport.start();
    setIsPlaying(true);
  }, []);

  const stop = useCallback(() => {
    const transport = Tone.getTransport();
    transport.stop();
    if (scheduleIdRef.current !== null) {
      transport.clear(scheduleIdRef.current);
      scheduleIdRef.current = null;
    }
    transport.position = 0;
    Tone.getDraw().cancel(); // queued step-highlight callbacks must not fire after stop
    bassRef.current?.release(); // a held bass note must not ring past stop
    setIsPlaying(false);
    setPosition(null);
  }, []);

  /** Audition a single hit when the user adds it to the grid. */
  const preview = useCallback(async (laneId: DrumLane, velocity: number) => {
    await Tone.start();
    kitRef.current ??= createKit(kitNameRef.current);
    kitRef.current.trigger(laneId, velocity, Tone.now());
  }, []);

  const previewBass = useCallback(
    async (midiPitch: number, velocity: number) => {
      await Tone.start();
      bassRef.current ??= new BassSynth();
      bassRef.current.trigger(midiPitch, 0.25, velocity, Tone.now());
    },
    [],
  );

  return { isPlaying, position, start, stop, preview, previewBass };
}
