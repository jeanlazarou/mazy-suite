import { useAtomValue, useSetAtom } from "jotai";
import WarningIcon from "@mui/icons-material/Warning";

import { hasAnomalies } from "./utils";
import { checkTimings } from "./actions/requests";

import { currentSong } from "./Lyrics";

export function AnomaliesIcon() {
  const openCheck = useSetAtom(checkTimings);
  const song = useAtomValue(currentSong);

  return hasAnomalies(song) ? (
    <div id="anomalies-icon" onClick={() => openCheck(true)}>
      <WarningIcon color="error" sx={{ cursor: "pointer" }} />
    </div>
  ) : null;
}
