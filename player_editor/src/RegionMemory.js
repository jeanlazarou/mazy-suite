import { atom, useAtomValue } from "jotai";
import { useAtomCallback } from "jotai/utils";
import Chip from "@mui/material/Chip";

import { toSMPTETimecode } from "./utils";
import { audioPosition } from "./Waveform";

export const savedRegion = atom(undefined);

const style = {
  position: "fixed",
  left: "6.8em",
  bottom: "1.6em"
}

export function RegionMemory() {
  const memorized = useAtomValue(savedRegion);

  const store = useAtomCallback(async (get, set) => {
    const position = get(audioPosition);

    set(savedRegion, position);
  });

  const memoryOn = memorized !== undefined;

  return (
    <div style={style}>
      <Chip
        size="small"
        label="R"
        color={memoryOn ? "primary" : "default"}
        onClick={store}
        sx={{ marginRight: "4px" }}
      />
      <Chip
        size="small"
        variant="outlined"
        sx={{ width: 250, fontFamily: "monospace", borderRadius: "4px" }}
        label={
          memoryOn
            ? `${toSMPTETimecode(memorized.start)} - ${toSMPTETimecode(memorized.end)}`
            : "--:--:--,--- - --:--:--,---"
        }
      />
    </div>
  );
}
