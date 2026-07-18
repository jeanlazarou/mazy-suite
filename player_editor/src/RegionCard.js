import { useAtomValue } from "jotai";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";

import { toSMPTETimecode } from "./utils";
import { regionRange } from "./actions/regions";

export function RegionCard() {
  const range = useAtomValue(regionRange);

  const className =
    range && range.changed ? "changed-regions" : "unchanged-regions";

  return range ? (
    <Card id="region-card" className={className}>
      <CardContent
        sx={{
          padding: "2px 8px",
          "&:last-child": { paddingBottom: "2px" },
          fontFamily: "monospace",
        }}
      >
        <span>
          {toSMPTETimecode(range.start)} - {toSMPTETimecode(range.end)}
        </span>
      </CardContent>
    </Card>
  ) : null;
}
