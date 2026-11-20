import { useAtomValue } from "jotai";

import { gateParams, levelAnalysis } from "./GateSettings";
import { audioPosition } from "./Waveform";
import { renderedRegions } from "./actions/regions";

import { LEVEL_FLOOR, levelAt, regionIndexAt } from "./core/gate";
import { levelToHeight } from "./core/peaks";

// The level the gate hears at the playback position, the threshold, and
// the gate LED: green while the voice goes through, red while it is muted
export function LevelMeter() {
  const position = useAtomValue(audioPosition);
  const analysis = useAtomValue(levelAnalysis);
  const { threshold } = useAtomValue(gateParams);
  const rendered = useAtomValue(renderedRegions);

  const level = levelAt(analysis, position);
  const closed = regionIndexAt(rendered, position) >= 0;
  const above = level >= threshold;

  return (
    <div className="level-meter">
      <span
        className={`gate-led ${closed ? "closed" : "open"}`}
        title={closed ? "Gate closed: muted" : "Gate open"}
      />
      <div className="meter-bar">
        <div
          className={`meter-fill ${above ? "above" : "below"}`}
          style={{ width: `${levelToHeight(level) * 100}%` }}
        />
        <div className="meter-threshold" style={{ left: `${levelToHeight(threshold) * 100}%` }} />
      </div>
      <span className="meter-value">{level > LEVEL_FLOOR ? `${level.toFixed(0)} dB` : "-∞ dB"}</span>
    </div>
  );
}
