import { atom, useAtom } from "jotai";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";

import "./ZoomInput.css";

export const zoomLevel = atom(0);

const clamp = (v) => Math.max(0, Math.min(100, Number(v) || 0));

// 0 fits the whole recording, 100 is 1000 px per second: a few
// milliseconds become visible at the region edges
export const zoomToPxPerSec = (level) => Math.round(clamp(level) ** 1.5);

// a quarter of a second fully zoomed out, down to 5 ms fully zoomed in
export function stepRelativeToZoom(level) {
  return Math.max(0.005, (100 - clamp(level)) / 400);
}

export function ZoomInput() {
  const [value, setValue] = useAtom(zoomLevel);

  return (
    <div className="zoom-input">
      <ZoomOutIcon
        sx={{ cursor: "pointer" }}
        onClick={() => setValue((v) => clamp(v - 5))}
      />
      <input
        type="range"
        min="0"
        max="100"
        value={value}
        onChange={(ev) => setValue(clamp(ev.target.value))}
        aria-label="zoom"
      />
      <ZoomInIcon
        sx={{ cursor: "pointer" }}
        onClick={() => setValue((v) => clamp(v + 5))}
      />
    </div>
  );
}
