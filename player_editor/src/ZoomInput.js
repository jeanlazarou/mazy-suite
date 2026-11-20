import { atom, useAtom } from "jotai";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";

import "./ZoomInput.css";

export const zoomLevel = atom(0);

// the range input gives a string, and the icons can step past its ends
const clamp = (v) => Math.max(0, Math.min(100, Number(v) || 0));

export function stepRelativeToZoom(zoomLevel) {
  return Math.max(0.01, (100 - clamp(zoomLevel)) / 100);
}

export function ZoomInput() {
  const [value, setValue] = useAtom(zoomLevel);

  return (
    <div className="zoom-input">
      <ZoomOutIcon
        sx={{ cursor: "pointer" }}
        onClick={() => setValue((v) => clamp(v - 1))}
      />
      <input
        type="range"
        min="0"
        max="100"
        value={value}
        onChange={(ev) => setValue(clamp(ev.target.value))}
      />
      <ZoomInIcon
        sx={{ cursor: "pointer" }}
        onClick={() => setValue((v) => clamp(v + 1))}
      />
    </div>
  );
}
