import { useEffect, useState } from "react";
import type { Pattern } from "../types";
import { resizePattern } from "../pattern";
import type { KitName } from "../audio/sampledKit";
import { KIT_NAMES } from "../audio/sampledKit";

const BPM_MIN = 40;
const BPM_MAX = 240;

interface TransportBarProps {
  pattern: Pattern;
  isPlaying: boolean;
  playMode: "section" | "song";
  kit: KitName;
  onKitChange: (kit: KitName) => void;
  canPlaySong: boolean;
  canUndo: boolean;
  onPlaySection: () => void;
  onPlaySong: () => void;
  onUndo: () => void;
  onChange: (pattern: Pattern) => void;
  onExportSection: () => void;
  onExportSong: () => void;
}

export function TransportBar({
  pattern,
  isPlaying,
  playMode,
  kit,
  onKitChange,
  canPlaySong,
  canUndo,
  onPlaySection,
  onPlaySong,
  onUndo,
  onChange,
  onExportSection,
  onExportSong,
}: TransportBarProps) {
  // Draft lets the user type freely ("9" on the way to "90"); valid values
  // commit immediately, anything else snaps back to the real BPM on blur.
  const [bpmDraft, setBpmDraft] = useState(String(pattern.bpm));
  useEffect(() => setBpmDraft(String(pattern.bpm)), [pattern.bpm]);

  const stopping = (mode: "section" | "song") =>
    isPlaying && playMode === mode;

  return (
    <div className="transport">
      <button className="play-button" onClick={onPlaySection}>
        {stopping("section") ? "■ Stop" : "▶ Section"}
      </button>
      <button
        className="play-song-button"
        onClick={onPlaySong}
        disabled={!isPlaying && !canPlaySong}
        title="Play the arrangement in order, looped"
      >
        {stopping("song") ? "■ Stop" : "▶ Song"}
      </button>

      <label>
        BPM
        <input
          type="number"
          min={BPM_MIN}
          max={BPM_MAX}
          value={bpmDraft}
          onChange={(e) => {
            setBpmDraft(e.target.value);
            const bpm = Number(e.target.value);
            if (e.target.value !== "" && bpm >= BPM_MIN && bpm <= BPM_MAX) {
              onChange({ ...pattern, bpm });
            }
          }}
          onBlur={() => setBpmDraft(String(pattern.bpm))}
        />
      </label>

      <label>
        Bars
        <select
          value={pattern.bars}
          onChange={(e) => onChange(resizePattern(pattern, Number(e.target.value)))}
        >
          {[1, 2, 4].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      <label>
        Swing
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(pattern.swing * 100)}
          onChange={(e) =>
            onChange({ ...pattern, swing: Number(e.target.value) / 100 })
          }
        />
        <span className="swing-value">{Math.round(pattern.swing * 100)}%</span>
      </label>

      <label>
        Kit
        <select
          className="kit-select"
          value={kit}
          onChange={(e) => onKitChange(e.target.value as KitName)}
          title="Drum sound: synthesized or sampled (samples stream from the web on first play)"
        >
          {KIT_NAMES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>

      <button
        className="tool-button undo-button"
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo the last change (Ctrl/Cmd-Z)"
      >
        ↩ Undo
      </button>

      <span className="transport-spacer" />

      <button className="export-button export-section" onClick={onExportSection}>
        ⬇ Section
      </button>
      <button
        className="export-button export-song"
        onClick={onExportSong}
        disabled={!canPlaySong}
        title="Export the whole arrangement as one MIDI file"
      >
        ⬇ Song
      </button>
    </div>
  );
}
