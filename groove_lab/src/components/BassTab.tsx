import { useRef, useState } from "react";
import type { BassNote, Pattern } from "../types";
import {
  BASS_FRETS,
  BASS_STRINGS,
  midiToNoteName,
  tabPosition,
  totalSteps,
} from "../types";

/** Honour the note's stored fingering when it can play the pitch;
 *  otherwise fall back to the smallest-fret position. */
function displayPosition(note: BassNote): { string: number; fret: number } {
  if (note.string !== undefined && BASS_STRINGS[note.string]) {
    const fret = note.midiPitch - BASS_STRINGS[note.string].open;
    if (fret >= 0 && fret <= BASS_FRETS) return { string: note.string, fret };
  }
  return tabPosition(note.midiPitch);
}
import { addBassNote, removeBassNote } from "../pattern";

interface BassTabProps {
  pattern: Pattern;
  currentStep: number;
  onChange: (pattern: Pattern) => void;
  onPreview: (midiPitch: number, velocity: number) => void;
}

interface Cursor {
  string: number;
  step: number;
}

const DIGIT_BUFFER_MS = 900;

/**
 * Bass tablature entry: four string lines aligned with the step grid.
 * Click a cell to put a note there (open string), then type the fret number;
 * arrows nudge pitch/position, right-click or Backspace deletes.
 */
export function BassTab({
  pattern,
  currentStep,
  onChange,
  onPreview,
}: BassTabProps) {
  const total = totalSteps(pattern);
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [duration, setDuration] = useState(2);
  const digitRef = useRef({ fret: 0, at: 0 });

  // Where each note renders: fret number at its start, sustain dashes after.
  const startAt = new Map(pattern.bass.map((n) => [n.step, n]));
  const sustain = new Map<number, number>(); // step → string row
  for (const n of pattern.bass) {
    const pos = displayPosition(n);
    for (let s = n.step + 1; s < Math.min(n.step + n.durationSteps, total); s++) {
      sustain.set(s, pos.string);
    }
  }

  const place = (string: number, step: number, fret: number) => {
    const existing = startAt.get(step);
    const midiPitch = BASS_STRINGS[string].open + fret;
    onChange(
      addBassNote(pattern, {
        step,
        durationSteps: existing?.durationSteps ?? duration,
        midiPitch,
        velocity: existing?.velocity,
        string, // keep the fingering the user chose
      }),
    );
    onPreview(midiPitch, 0.75);
  };

  const onCellDown = (
    string: number,
    step: number,
    e: React.MouseEvent,
  ) => {
    if (e.button === 2) {
      if (startAt.has(step)) onChange(removeBassNote(pattern, step));
      return;
    }
    if (e.button !== 0) return;
    setCursor({ string, step });
    digitRef.current = { fret: 0, at: 0 };
    const existing = startAt.get(step);
    const samePlace = existing && displayPosition(existing).string === string;
    // Clicking a note's own cell just selects it; anywhere else places an
    // open-string note ready for a typed fret number.
    if (!samePlace) place(string, step, 0);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!cursor) return;
    const note = startAt.get(cursor.step);
    if (e.key >= "0" && e.key <= "9") {
      const digit = Number(e.key);
      const now = Date.now();
      const combined = digitRef.current.fret * 10 + digit;
      const fret =
        now - digitRef.current.at < DIGIT_BUFFER_MS && combined <= BASS_FRETS
          ? combined
          : digit;
      digitRef.current = { fret, at: now };
      place(cursor.string, cursor.step, fret);
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      if (note) {
        const next = note.midiPitch + (e.key === "ArrowUp" ? 1 : -1);
        // Stay on the current string while it can reach the pitch.
        const sameStringFret = next - BASS_STRINGS[cursor.string].open;
        const pos =
          sameStringFret >= 0 && sameStringFret <= BASS_FRETS
            ? { string: cursor.string, fret: sameStringFret }
            : tabPosition(next);
        if (BASS_STRINGS[pos.string].open + pos.fret === next) {
          place(pos.string, cursor.step, pos.fret);
          setCursor({ string: pos.string, step: cursor.step });
        }
      }
    } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const step = Math.max(
        0,
        Math.min(total - 1, cursor.step + (e.key === "ArrowRight" ? 1 : -1)),
      );
      setCursor({ ...cursor, step });
      digitRef.current = { fret: 0, at: 0 };
    } else if (e.key === "Backspace" || e.key === "Delete") {
      if (note) onChange(removeBassNote(pattern, cursor.step));
    } else {
      return;
    }
    e.preventDefault();
  };

  return (
    <div className="tab-view">
      <div
        className="tab-grid"
        style={{ ["--steps" as string]: total }}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="grid-corner" />
        {Array.from({ length: total }, (_, step) => (
          <div
            key={step}
            className={`step-header ${step % 4 === 0 ? "beat" : ""} ${
              step === currentStep ? "playing" : ""
            }`}
          >
            {step % 4 === 0 ? step / 4 + 1 : "·"}
          </div>
        ))}

        {BASS_STRINGS.map((string, row) => (
          <TabRow
            key={string.name}
            row={row}
            name={string.name}
            open={string.open}
            total={total}
            currentStep={currentStep}
            cursor={cursor}
            startAt={startAt}
            sustain={sustain}
            onCellDown={onCellDown}
            onPreview={() => onPreview(string.open, 0.75)}
          />
        ))}
      </div>

      <div className="tab-controls">
        <label className="tab-duration">
          Note length
          <select
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          >
            <option value={1}>1/16</option>
            <option value={2}>1/8</option>
            <option value={4}>1/4</option>
            <option value={8}>1/2</option>
          </select>
        </label>
        <span className="tab-hint">
          click: place note · type fret number · ↑↓ semitone · ←→ move ·
          right-click / ⌫ delete
        </span>
      </div>
    </div>
  );
}

interface TabRowProps {
  row: number;
  name: string;
  open: number;
  total: number;
  currentStep: number;
  cursor: Cursor | null;
  startAt: Map<number, BassNote>;
  sustain: Map<number, number>;
  onCellDown: (string: number, step: number, e: React.MouseEvent) => void;
  onPreview: () => void;
}

function TabRow({
  row,
  name,
  open,
  total,
  currentStep,
  cursor,
  startAt,
  sustain,
  onCellDown,
  onPreview,
}: TabRowProps) {
  return (
    <>
      <button
        className="tab-label"
        onClick={onPreview}
        title={`${name} string (open = ${midiToNoteName(open)}) — click to hear`}
      >
        {name}
      </button>
      {Array.from({ length: total }, (_, step) => {
        const note = startAt.get(step);
        const pos = note ? displayPosition(note) : null;
        const showFret = pos?.string === row ? pos.fret : null;
        const sustained = sustain.get(step) === row;
        const selected = cursor?.string === row && cursor.step === step;
        return (
          <button
            key={step}
            className={`tab-cell ${step % 4 === 0 ? "beat" : ""} ${
              selected ? "selected" : ""
            } ${step === currentStep ? "playing" : ""}`}
            title={
              note && showFret !== null
                ? `${midiToNoteName(note.midiPitch)} (fret ${showFret}) — type a fret number to change`
                : `${name} string, step ${step + 1}`
            }
            onMouseDown={(e) => onCellDown(row, step, e)}
          >
            {showFret !== null ? (
              <span className="fret-num">{showFret}</span>
            ) : sustained ? (
              <span className="fret-sustain">–</span>
            ) : (
              ""
            )}
          </button>
        );
      })}
    </>
  );
}
