import { atom, useAtomValue } from "jotai";
import { useAtomCallback } from "jotai/utils";
import Chip from "@mui/material/Chip";

import { toTimecode } from "./utils";
import { memorizePosition } from "./actions/memorize_position";
import { gotoMemorizedPosition } from "./actions/goto_memorized_position";

export const savedPosition = atom(undefined);

export function PositionMemory() {
  const memorized = useAtomValue(savedPosition);

  const goto = useAtomCallback(async (get, set) => gotoMemorizedPosition(get, set));
  const store = useAtomCallback(async (get, set) => memorizePosition(get, set));

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
        label={memoryOn ? toTimecode(memorized) : "--:--.---"}
      />
    </div>
  );
}
