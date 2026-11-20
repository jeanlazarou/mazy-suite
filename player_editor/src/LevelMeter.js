import { useAtomValue } from "jotai";

import { audioPosition, levelAnalysis } from "./Waveform";
import { LEVEL_FLOOR, levelAt, levelToWidth } from "./levels";

// Loudness at the playback position, on a -90..0 dB scale
export function LevelMeter() {
  const position = useAtomValue(audioPosition);
  const analysis = useAtomValue(levelAnalysis);

  const level = levelAt(analysis, position);

  return (
    <div className="level-meter" title="Level at the playback position">
      <div className="meter-bar">
        <div className="meter-fill" style={{ width: `${levelToWidth(level) * 100}%` }} />
      </div>
      <span className="meter-value">{level > LEVEL_FLOOR ? `${level.toFixed(0)} dB` : "-∞ dB"}</span>
    </div>
  );
}
