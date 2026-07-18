import { useEffect, useRef, useState } from "react";
import type { Pattern } from "../types";
import {
  BASS_PITCH_MAX,
  BASS_PITCH_MIN,
  isSharpPitch,
  midiToNoteName,
  totalSteps,
} from "../types";
import {
  DEFAULT_VELOCITY,
  addBassNote,
  cycleBassNoteVelocity,
  removeBassNote,
} from "../pattern";

interface BassRollProps {
  pattern: Pattern;
  currentStep: number;
  onChange: (pattern: Pattern) => void;
  onPreview: (midiPitch: number, velocity: number) => void;
}

// Top row = highest pitch.
const PITCHES = Array.from(
  { length: BASS_PITCH_MAX - BASS_PITCH_MIN + 1 },
  (_, i) => BASS_PITCH_MAX - i,
);

interface Placing {
  pitch: number;
  start: number;
  end: number; // inclusive
}

/**
 * Piano-roll grid for the bass line. Press on an empty cell and drag right to
 * set the note length; click a note to delete it; right-click a note to cycle
 * ghost/normal/accent. The line is monophonic — overlaps replace/truncate.
 */
export function BassRoll({
  pattern,
  currentStep,
  onChange,
  onPreview,
}: BassRollProps) {
  const steps = totalSteps(pattern);
  const [placing, setPlacing] = useState<Placing | null>(null);
  const patternRef = useRef(pattern);
  patternRef.current = pattern;

  useEffect(() => {
    if (!placing) return;
    const commit = () => {
      onChange(
        addBassNote(patternRef.current, {
          step: placing.start,
          durationSteps: placing.end - placing.start + 1,
          midiPitch: placing.pitch,
        }),
      );
      onPreview(placing.pitch, DEFAULT_VELOCITY);
      setPlacing(null);
    };
    window.addEventListener("mouseup", commit);
    return () => window.removeEventListener("mouseup", commit);
  }, [placing, onChange, onPreview]);

  const rowOf = (pitch: number) => 2 + (BASS_PITCH_MAX - pitch); // row 1 = header
  const colOf = (step: number) => 2 + step; // col 1 = labels

  return (
    <div
      className="roll-grid"
      style={{ ["--steps" as string]: steps }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="grid-corner" />
      {Array.from({ length: steps }, (_, step) => (
        <div
          key={step}
          className={`step-header ${step % 4 === 0 ? "beat" : ""} ${
            step === currentStep ? "playing" : ""
          }`}
        >
          {step % 4 === 0 ? step / 4 + 1 : "·"}
        </div>
      ))}

      {PITCHES.map((pitch) => (
        <RollRow
          key={pitch}
          row={rowOf(pitch)}
          pitch={pitch}
          steps={steps}
          currentStep={currentStep}
          placing={placing}
          onStartPlacing={(step) =>
            setPlacing({ pitch, start: step, end: step })
          }
          onExtendPlacing={(step) =>
            setPlacing((p) =>
              p && p.pitch === pitch && step >= p.start ? { ...p, end: step } : p,
            )
          }
          onPreview={() => onPreview(pitch, DEFAULT_VELOCITY)}
        />
      ))}

      {pattern.bass.map((note) => (
        <div
          key={note.step}
          className="note"
          style={{
            gridRow: rowOf(note.midiPitch),
            gridColumn: `${colOf(note.step)} / span ${note.durationSteps}`,
            ["--vel" as string]: note.velocity,
          }}
          title={`${midiToNoteName(note.midiPitch)} · velocity ${note.velocity.toFixed(
            2,
          )} — click to delete, right-click to cycle`}
          onMouseDown={(e) => {
            if (e.button === 2) {
              onChange(cycleBassNoteVelocity(patternRef.current, note.step));
            } else {
              onChange(removeBassNote(patternRef.current, note.step));
            }
          }}
        />
      ))}

      {placing && (
        <div
          className="note ghost"
          style={{
            gridRow: rowOf(placing.pitch),
            gridColumn: `${colOf(placing.start)} / span ${
              placing.end - placing.start + 1
            }`,
          }}
        />
      )}
    </div>
  );
}

interface RollRowProps {
  row: number;
  pitch: number;
  steps: number;
  currentStep: number;
  placing: Placing | null;
  onStartPlacing: (step: number) => void;
  onExtendPlacing: (step: number) => void;
  onPreview: () => void;
}

function RollRow({
  row,
  pitch,
  steps,
  currentStep,
  placing,
  onStartPlacing,
  onExtendPlacing,
  onPreview,
}: RollRowProps) {
  const name = midiToNoteName(pitch);
  const sharp = isSharpPitch(pitch);
  // Every item is placed explicitly: auto-placement would skip grid cells
  // occupied by the note divs and shift whole rows sideways.
  return (
    <>
      <button
        className={`roll-label ${sharp ? "sharp" : ""}`}
        style={{ gridRow: row, gridColumn: 1 }}
        onClick={onPreview}
        title="Click to hear this pitch"
      >
        {sharp ? "" : name}
      </button>
      {Array.from({ length: steps }, (_, step) => (
        <button
          key={step}
          className={`roll-cell ${sharp ? "sharp" : ""} ${
            step % 4 === 0 ? "beat" : ""
          } ${step === currentStep ? "playing" : ""}`}
          style={{ gridRow: row, gridColumn: 2 + step }}
          title={name}
          onMouseDown={(e) => {
            if (e.button === 0) onStartPlacing(step);
          }}
          onMouseEnter={() => {
            if (placing) onExtendPlacing(step);
          }}
        />
      ))}
    </>
  );
}
