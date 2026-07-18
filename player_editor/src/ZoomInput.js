import { atom, useAtom } from "jotai";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";

import "./ZoomInput.css";

export const zoomLevel = atom(0);

export function stepRelativeToZoom(zoomLevel) {
  return (1 * (100 - zoomLevel)) / 100;
}

export function ZoomInput() {
  const [value, setValue] = useAtom(zoomLevel);

  return (
    <div className="zoom-input">
      <ZoomOutIcon
        sx={{ cursor: "pointer" }}
        onClick={() => setValue((v) => v - 1)}
      />
      <input
        type="range"
        min="1"
        max="100"
        value={value}
        onChange={(ev) => setValue(ev.target.value)}
      />
      <ZoomInIcon
        sx={{ cursor: "pointer" }}
        onClick={() => setValue((v) => v + 1)}
      />
    </div>
  );
}
