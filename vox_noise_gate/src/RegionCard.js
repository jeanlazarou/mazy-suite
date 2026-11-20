import { useAtomValue } from "jotai";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";

import { toTimecode } from "./utils";
import { activeRegion } from "./actions/regions";

export function RegionCard() {
  const range = useAtomValue(activeRegion);

  if (!range) return null;

  const className = range.changed ? "changed-regions" : "unchanged-regions";
  const length = Math.round((range.end - range.start) * 1000);

  return (
    <Card id="region-card" className={className}>
      <CardContent
        sx={{
          padding: "2px 8px",
          "&:last-child": { paddingBottom: "2px" },
          fontFamily: "monospace",
        }}
      >
        <span>
          {toTimecode(range.start)} - {toTimecode(range.end)} ({length} ms)
          {range.changed ? " ⏎ to keep" : ""}
        </span>
      </CardContent>
    </Card>
  );
}
