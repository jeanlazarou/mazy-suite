import { useRef } from "react";
import type { Pattern } from "../types";
import { totalSteps } from "../types";
import type { PatternChange } from "../editor";
import { newGesture } from "../editor";
import { chordAt, chordChanges, chordToneNames, parseBar } from "../chords";

interface ChordStripProps {
  pattern: Pattern;
  currentStep: number;
  onChange: PatternChange;
}

const HOW =
  "One chord for the whole bar, two for half a bar each (C G), up to four; % holds the previous one. Empty = the chord before continues.";

/**
 * One chord box per bar, aligned with the grids below (same column
 * geometry). What's typed is stored as is; the bass generator and the
 * piano roll's chord-tone shading read it.
 */
export function ChordStrip({ pattern, currentStep, onChange }: ChordStripProps) {
  const steps = totalSteps(pattern);
  const groupRef = useRef(newGesture("chords"));
  const changes = chordChanges(pattern);

  const setBar = (bar: number, text: string) =>
    onChange((p) => {
      const chords = Array.from({ length: p.bars }, (_, b) => p.chords?.[b] ?? "");
      chords[bar] = text;
      const next: Pattern = { ...p, chords };
      if (chords.every((c) => c.trim() === "")) delete next.chords;
      return next;
    }, groupRef.current);

  return (
    <div className="chord-strip" style={{ ["--steps" as string]: steps }}>
      <div className="chord-label">Chords</div>
      {Array.from({ length: pattern.bars }, (_, bar) => {
        const text = pattern.chords?.[bar] ?? "";
        const start = bar * pattern.stepsPerBar;
        const { chords, error } = parseBar(text, pattern.stepsPerBar);
        const continuing = text.trim() === "" ? chordAt(changes, start) : null;
        const playing =
          currentStep >= start && currentStep < start + pattern.stepsPerBar;
        const title = error
          ? `${error} — try C, Am, G7, Fmaj7, Bb, F#m, Dm7b5, Csus4, C/E. ${HOW}`
          : chords.length > 0
            ? chords
                .map(({ chord }) => `${chord.symbol}: ${chordToneNames(chord).join(" ")}`)
                .join(" · ")
            : continuing
              ? `${continuing.symbol} continues. ${HOW}`
              : `Chords of bar ${bar + 1}. ${HOW}`;
        return (
          <input
            key={bar}
            className={`chord-bar ${error ? "invalid" : ""} ${playing ? "playing" : ""}`}
            style={{ gridColumn: `${2 + start} / span ${pattern.stepsPerBar}` }}
            value={text}
            placeholder={
              continuing
                ? `(${continuing.symbol})`
                : bar === 0
                  ? "chords, e.g. Am  or  C G"
                  : ""
            }
            title={title}
            spellCheck={false}
            autoComplete="off"
            onFocus={() => (groupRef.current = newGesture("chords"))}
            onChange={(e) => setBar(bar, e.target.value)}
          />
        );
      })}
    </div>
  );
}
