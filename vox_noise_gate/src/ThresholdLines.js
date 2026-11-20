import { useAtomValue } from "jotai";

import { gateParams } from "./GateSettings";
import { WAVE_HEIGHT } from "./Waveform";
import { levelToHeight } from "./core/peaks";

// The threshold drawn over the level view: where the level dips under the
// lines, the gate hears silence
export function ThresholdLines() {
  const { threshold } = useAtomValue(gateParams);

  const half = WAVE_HEIGHT / 2;
  const offset = levelToHeight(threshold) * half;

  return (
    <div className="threshold-lines" style={{ height: WAVE_HEIGHT }}>
      <div className="threshold-line" style={{ top: half - offset }}>
        <span>{threshold.toFixed(1)} dB</span>
      </div>
      <div className="threshold-line" style={{ top: half + offset }} />
    </div>
  );
}
