import { useAtomValue } from "jotai";

import { formatTime } from "./utils";
import { audioPosition } from "./Waveform";

export function Timer() {
  const current = useAtomValue(audioPosition);

  return (
    <div className="playback-timer">
      <span>{formatTime(current)}</span>
    </div>
  );
}
