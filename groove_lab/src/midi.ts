import { Midi } from "@tonejs/midi";
import type { Pattern } from "./types";
import { DRUM_LANES, totalSteps } from "./types";

// GM program 33 (0-based): Electric Bass (finger).
const BASS_PROGRAM = 33;

/**
 * Pure render: patterns in play order → one standard MIDI file.
 *
 * Contract (MIDI_EXPORT_NOTES.md §3/§5): unrenderable input returns null and
 * NEVER throws — but the failure is logged, not swallowed silently.
 * Individual out-of-range notes are skipped, they don't kill the file.
 *
 * Drums go on channel 10 (index 9) with GM percussion numbers; bass on its
 * own track. Swing is baked into the tick positions so a DAW plays back what
 * the app plays; sections with a different bpm get a tempo change event.
 */
export function songToMidi(patterns: Pattern[]): Uint8Array | null {
  try {
    if (patterns.length === 0 || !patterns.every(isRenderable)) {
      console.warn("MIDI render failed: input not renderable", patterns);
      return null;
    }
    const midi = new Midi();
    midi.header.setTempo(patterns[0].bpm);
    const sixteenth = midi.header.ppq / 4;

    const drums = midi.addTrack();
    drums.name = "Drums";
    drums.channel = 9;
    const bass = midi.addTrack();
    bass.name = "Bass";
    bass.channel = 0;
    bass.instrument.number = BASS_PROGRAM;

    let offset = 0;
    let lastBpm = patterns[0].bpm;
    for (const pattern of patterns) {
      if (pattern.bpm !== lastBpm) {
        midi.header.tempos.push({ bpm: pattern.bpm, ticks: offset });
        lastBpm = pattern.bpm;
      }
      const max = totalSteps(pattern);
      const swing = clamp01(pattern.swing) ?? 0;
      // Same feel as playback: off-beat sixteenths shift toward the triplet.
      const tickOf = (step: number) =>
        offset +
        Math.round(
          step * sixteenth + (step % 2 === 1 ? (swing * sixteenth) / 3 : 0),
        );

      for (const lane of DRUM_LANES) {
        for (const hit of pattern.drums[lane.id] ?? []) {
          const velocity = clamp01(hit.velocity);
          if (!isValidStep(hit.step, max) || velocity === null) continue;
          drums.addNote({
            midi: lane.gmNote,
            ticks: tickOf(hit.step),
            durationTicks: Math.round(sixteenth / 2),
            velocity,
          });
        }
      }

      for (const note of pattern.bass ?? []) {
        const velocity = clamp01(note.velocity);
        if (
          !isValidStep(note.step, max) ||
          velocity === null ||
          !Number.isInteger(note.midiPitch) ||
          note.midiPitch < 0 ||
          note.midiPitch > 127 ||
          !Number.isFinite(note.durationSteps) ||
          note.durationSteps < 1
        ) {
          continue;
        }
        const endStep = Math.min(note.step + note.durationSteps, max);
        const ticks = tickOf(note.step);
        bass.addNote({
          midi: note.midiPitch,
          ticks,
          durationTicks: offset + Math.round(endStep * sixteenth) - ticks,
          velocity,
        });
      }

      offset += max * sixteenth;
    }

    return midi.toArray();
  } catch (err) {
    console.warn("MIDI render failed", err, patterns);
    return null;
  }
}

export function patternToMidi(pattern: Pattern): Uint8Array | null {
  return songToMidi(pattern === null || pattern === undefined ? [] : [pattern]);
}

function isRenderable(pattern: Pattern): boolean {
  return (
    typeof pattern === "object" &&
    pattern !== null &&
    Number.isFinite(pattern.bpm) &&
    pattern.bpm > 0 &&
    Number.isInteger(pattern.bars) &&
    pattern.bars > 0 &&
    Number.isInteger(pattern.stepsPerBar) &&
    pattern.stepsPerBar > 0 &&
    typeof pattern.drums === "object" &&
    pattern.drums !== null &&
    Array.isArray(pattern.bass)
  );
}

function isValidStep(step: number, max: number): boolean {
  return Number.isInteger(step) && step >= 0 && step < max;
}

function clamp01(v: number): number | null {
  if (!Number.isFinite(v)) return null;
  return Math.min(1, Math.max(0, v));
}
