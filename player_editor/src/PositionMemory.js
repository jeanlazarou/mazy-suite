import { atom, useAtomValue } from "jotai";
import { useAtomCallback } from "jotai/utils";
import Chip from "@mui/material/Chip";

import { toSMPTETimecode } from "./utils";
import { audioEngine, audioPosition } from "./Waveform";

export const savedPosition = atom(undefined);

export function PositionMemory() {
  const memorized = useAtomValue(savedPosition);
  const engine = useAtomValue(audioEngine);

  const goto = useAtomCallback(async (get, set) => {
    const position = get(savedPosition);

    engine.seekTo(position);

    set(audioPosition, position);
  });

  const store = useAtomCallback(async (get, set) => {
    const position = get(audioPosition);

    set(savedPosition, position);
  });

  const memoryOn = memorized !== undefined;

  return (
    <div>
      <Chip
        size="small"
        label="M"
        color={memoryOn ? "primary" : "default"}
        onClick={store}
        sx={{ marginRight: "4px" }}
      />
      <Chip
        size="small"
        variant="outlined"
        onClick={memoryOn ? goto : undefined}
        sx={{ width: 150, fontFamily: "monospace", borderRadius: "4px" }}
        label={memoryOn ? toSMPTETimecode(memorized) : "--:--:--,---"}
      />
    </div>
  );
}
