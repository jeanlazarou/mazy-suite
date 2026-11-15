import { useEffect, useState } from "react";
import type { BassNote, Pattern } from "../types";
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
  moveBassNote,
  removeBassNote,
  resizeBassNote,
} from "../pattern";
import type { PatternChange } from "../editor";
import type { Chord } from "../chords";
import { chordAt, chordChanges, isChordTone } from "../chords";

interface BassRollProps {
  pattern: Pattern;
  currentStep: number;
  onChange: PatternChange;
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

/** A note being moved or resized; `step/pitch/duration` = where it would land. */
interface Dragging {
  kind: "move" | "resize";
  from: BassNote;
  grab: number; // move: steps from the note's start to the cell grabbed
  step: number;
  pitch: number;
  duration: number;
  moved: boolean; // left its starting place at some point
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/**
 * Piano-roll grid for the bass line. Press on an empty cell and drag right to
 * set the note length; drag a note to move it, its right edge to resize it;
 * click a note to delete it; right-click a note to cycle ghost/normal/accent.
 * The line is monophonic — overlaps replace/truncate.
 */
export function BassRoll({
  pattern,
  currentStep,
  onChange,
  onPreview,
}: BassRollProps) {
  const steps = totalSteps(pattern);
  const [placing, setPlacing] = useState<Placing | null>(null);
  const [dragging, setDragging] = useState<Dragging | null>(null);
  // Chord sounding at each step, for the chord-tone shading.
  const changes = chordChanges(pattern);
  const stepChords = Array.from({ length: steps }, (_, s) => chordAt(changes, s));

  useEffect(() => {
    if (!placing) return;
    const commit = () => {
      onChange((p) =>
        addBassNote(p, {
          step: placing.start,
          durationSteps: placing.end - placing.start + 1,
          midiPitch: placing.pitch,
        }),
      );
      onPreview(placing.pitch, DEFAULT_VELOCITY);
      setPlacing(null);
    };
    const cancel = (e: KeyboardEvent) => e.key === "Escape" && setPlacing(null);
    window.addEventListener("mouseup", commit);
    window.addEventListener("keydown", cancel);
    return () => {
      window.removeEventListener("mouseup", commit);
      window.removeEventListener("keydown", cancel);
    };
  }, [placing, onChange, onPreview]);

  useEffect(() => {
    if (!dragging) return;
    const d = dragging;
    const commit = () => {
      if (d.kind === "move" && !d.moved) {
        onChange((p) => removeBassNote(p, d.from.step)); // a plain click
      } else if (d.kind === "move") {
        onChange((p) =>
          moveBassNote(p, d.from.step, { step: d.step, midiPitch: d.pitch }),
        );
      } else if (d.moved) {
        onChange((p) => resizeBassNote(p, d.from.step, d.duration));
      }
      setDragging(null);
    };
    const cancel = (e: KeyboardEvent) => e.key === "Escape" && setDragging(null);
    window.addEventListener("mouseup", commit);
    window.addEventListener("keydown", cancel);
    return () => {
      window.removeEventListener("mouseup", commit);
      window.removeEventListener("keydown", cancel);
    };
  }, [dragging, onChange]);

  const onCellEnter = (step: number, pitch: number) => {
    if (placing) {
      if (step >= placing.start) setPlacing({ ...placing, end: step });
      return;
    }
    if (!dragging) return;
    const d = dragging;
    if (d.kind === "move") {
      // The whole note stays inside the bar while it's dragged.
      const start = clamp(step - d.grab, 0, steps - d.from.durationSteps);
      // Leaving the grabbed cell makes it a drag, even if the note is
      // clamped where it was — releasing must not count as a click.
      const moved =
        d.moved || step !== d.from.step + d.grab || pitch !== d.from.midiPitch;
      if (start === d.step && pitch === d.pitch && moved === d.moved) return;
      if (pitch !== d.pitch) onPreview(pitch, d.from.velocity);
      setDragging({ ...d, step: start, pitch, moved });
    } else {
      const duration = clamp(step - d.from.step + 1, 1, steps - d.from.step);
      if (duration !== d.duration) setDragging({ ...d, duration, moved: true });
    }
  };

  const startDrag = (
    kind: Dragging["kind"],
    note: BassNote,
    e: React.MouseEvent<HTMLElement>,
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const grab =
      kind === "move"
        ? clamp(
            Math.floor(((e.clientX - rect.left) / rect.width) * note.durationSteps),
            0,
            note.durationSteps - 1,
          )
        : 0;
    setDragging({
      kind,
      from: note,
      grab,
      step: note.step,
      pitch: note.midiPitch,
      duration: note.durationSteps,
      moved: false,
    });
  };

  const rowOf = (pitch: number) => 2 + (BASS_PITCH_MAX - pitch); // row 1 = header
  const colOf = (step: number) => 2 + step; // col 1 = labels

  const ghost = placing
    ? {
        pitch: placing.pitch,
        step: placing.start,
        length: placing.end - placing.start + 1,
      }
    : dragging
      ? {
          pitch: dragging.pitch,
          step: dragging.step,
          length: Math.min(dragging.duration, steps - dragging.step),
        }
      : null;

  const gridClass = [
    "roll-grid",
    placing || dragging ? "editing" : "",
    dragging ? `${dragging.kind}-drag` : "",
  ].join(" ");

  return (
    <div
      className={gridClass}
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
          stepChords={stepChords}
          onStartPlacing={(step) =>
            setPlacing({ pitch, start: step, end: step })
          }
          onCellEnter={(step) => onCellEnter(step, pitch)}
          onPreview={() => onPreview(pitch, DEFAULT_VELOCITY)}
        />
      ))}

      {pattern.bass.map((note) => (
        <div
          key={note.step}
          className={`note ${dragging?.from.step === note.step ? "lifted" : ""}`}
          style={{
            gridRow: rowOf(note.midiPitch),
            gridColumn: `${colOf(note.step)} / span ${note.durationSteps}`,
            ["--vel" as string]: note.velocity,
          }}
          title={`${midiToNoteName(note.midiPitch)} · velocity ${note.velocity.toFixed(
            2,
          )} — drag to move, drag the right edge to change length, click to delete, right-click to cycle`}
          onMouseDown={(e) => {
            if (e.button === 2) {
              onChange((p) => cycleBassNoteVelocity(p, note.step));
            } else if (e.button === 0) {
              startDrag("move", note, e);
            }
          }}
        >
          <div
            className="note-handle"
            onMouseDown={(e) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              startDrag("resize", note, e);
            }}
          />
        </div>
      ))}

      {ghost && (
        <div
          className="note ghost"
          style={{
            gridRow: rowOf(ghost.pitch),
            gridColumn: `${colOf(ghost.step)} / span ${ghost.length}`,
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
  stepChords: (Chord | null)[];
  onStartPlacing: (step: number) => void;
  onCellEnter: (step: number) => void;
  onPreview: () => void;
}

/** "chord-root" for the note the bass should play, "chord-tone" for the rest of the chord. */
function chordClass(chord: Chord | null, pitch: number): string {
  if (!chord) return "";
  const pc = pitch % 12;
  if (pc === chord.bass) return "chord-root";
  return isChordTone(chord, pc) ? "chord-tone" : "";
}

function RollRow({
  row,
  pitch,
  steps,
  currentStep,
  stepChords,
  onStartPlacing,
  onCellEnter,
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
          className={`roll-cell ${sharp ? "sharp" : ""} ${chordClass(
            stepChords[step],
            pitch,
          )} ${step % 4 === 0 ? "beat" : ""} ${
            step === currentStep ? "playing" : ""
          }`}
          style={{ gridRow: row, gridColumn: 2 + step }}
          title={name}
          onMouseDown={(e) => {
            if (e.button === 0) onStartPlacing(step);
          }}
          onMouseEnter={() => onCellEnter(step)}
        />
      ))}
    </>
  );
}
