import { useState } from "react";
import type { DrumLane, Pattern } from "../types";
import { BASS_PITCH_MIN, DRUM_LANES, midiToNoteName } from "../types";
import type { BassMode, StyleName } from "../generate";
import {
  STYLE_NAMES,
  applyEuclidean,
  generateBass,
  generateFill,
  generateStyle,
  humanizeBass,
  humanizeDrums,
} from "../generate";

interface GenProps {
  pattern: Pattern;
  onChange: (pattern: Pattern) => void;
}

export function DrumGenControls({ pattern, onChange }: GenProps) {
  const [style, setStyle] = useState<StyleName>("rock");
  const [lane, setLane] = useState<DrumLane>("hhClosed");
  const [pulses, setPulses] = useState(7);

  return (
    <div className="gen-controls">
      <select
        className="gen-style"
        value={style}
        onChange={(e) => setStyle(e.target.value as StyleName)}
        title="Style template"
      >
        {STYLE_NAMES.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
      <button
        className="tool-button gen-drums"
        onClick={() => onChange(generateStyle(pattern, style))}
        title="Replace the drums with this style (click again for a variation)"
      >
        Generate
      </button>
      <button
        className="tool-button gen-fill"
        onClick={() => onChange(generateFill(pattern))}
        title="Replace the last half-bar or so with a fill"
      >
        Fill
      </button>
      <button
        className="tool-button humanize-drums"
        onClick={() => onChange(humanizeDrums(pattern))}
        title="Spread hit velocities a little so it sounds less robotic"
      >
        Humanize
      </button>

      <span className="gen-sep" />

      <select
        className="euclid-lane"
        value={lane}
        onChange={(e) => setLane(e.target.value as DrumLane)}
        title="Lane for the Euclidean rhythm"
      >
        {DRUM_LANES.map((l) => (
          <option key={l.id} value={l.id}>
            {l.label}
          </option>
        ))}
      </select>
      <input
        className="euclid-pulses"
        type="number"
        min={1}
        max={pattern.stepsPerBar}
        value={pulses}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isInteger(n) && n >= 1 && n <= pattern.stepsPerBar) {
            setPulses(n);
          }
        }}
        title="Hits per bar, spread as evenly as possible (density knob)"
      />
      <button
        className="tool-button euclid-apply"
        onClick={() => onChange(applyEuclidean(pattern, lane, pulses))}
        title="Spread this many hits evenly across the bar on the chosen lane"
      >
        Euclid
      </button>
    </div>
  );
}

// Root choices: one octave of a 4-string bass, E1 to E2.
const ROOTS = Array.from({ length: 13 }, (_, i) => BASS_PITCH_MIN + i);

export function BassGenControls({ pattern, onChange }: GenProps) {
  const [root, setRoot] = useState(33); // A1
  const [mode, setMode] = useState<BassMode>("roots");

  return (
    <div className="gen-controls">
      <select
        className="bass-root"
        value={root}
        onChange={(e) => setRoot(Number(e.target.value))}
        title="Root note"
      >
        {ROOTS.map((pitch) => (
          <option key={pitch} value={pitch}>
            {midiToNoteName(pitch)}
          </option>
        ))}
      </select>
      <select
        className="bass-mode"
        value={mode}
        onChange={(e) => setMode(e.target.value as BassMode)}
        title="How pitches are chosen"
      >
        <option value="roots">roots</option>
        <option value="rootFifth">root–fifth</option>
        <option value="walking">walking</option>
      </select>
      <button
        className="tool-button gen-bass"
        onClick={() => onChange(generateBass(pattern, root, mode))}
        title="Generate a bass line locked to the kick rhythm"
      >
        Generate
      </button>
      <button
        className="tool-button humanize-bass"
        onClick={() => onChange(humanizeBass(pattern))}
        title="Spread note velocities a little so it sounds less robotic"
      >
        Humanize
      </button>
    </div>
  );
}
