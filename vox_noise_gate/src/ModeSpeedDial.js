import { useState } from "react";
import { useAtom } from "jotai";
import { useAtomCallback } from "jotai/utils";
import SpeedDial from "@mui/material/SpeedDial";
import SpeedDialAction from "@mui/material/SpeedDialAction";
import SpeedDialIcon from "@mui/material/SpeedDialIcon";
import EditIcon from "@mui/icons-material/Edit";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import DeleteIcon from "@mui/icons-material/Delete";

import { editorMode } from "./Waveform";
import { releaseActive } from "./actions/regions";

const modes = [
  {
    icon: <EditIcon />,
    value: "edit",
    tooltip: "Click a region to edit it, drag across the waveform to draw one",
  },
  {
    icon: <ContentCutIcon />,
    value: "split",
    tooltip: "Click a region to split it",
  },
  {
    icon: <DeleteIcon />,
    value: "delete",
    tooltip: "Click a region to keep its audio, or a keep zone to give it back to the gate",
  },
];

const COLORS = {
  edit: ["#2185d0", "#1678c2"],
  split: ["#f2711c", "#e26202"],
  delete: ["#db2828", "#ca1010"],
};

export function ModeSpeedDial() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useAtom(editorMode);

  const handleModeChange = useAtomCallback(async (get, set, newMode) => {
    releaseActive(get, set);

    setMode(newMode);
    setOpen(false);
  });

  const currentMode = modes.find((m) => m.value === mode);

  return (
    <SpeedDial
      ariaLabel="Editor mode speed dial"
      sx={{
        position: "fixed",
        bottom: 16,
        right: 16,
        "& .MuiFab-primary": {
          backgroundColor: COLORS[mode][0],
          "&:hover": { backgroundColor: COLORS[mode][1] },
        },
      }}
      icon={<SpeedDialIcon icon={currentMode?.icon} />}
      onClose={() => setOpen(false)}
      onOpen={() => setOpen(true)}
      open={open}
    >
      {modes.map((action) => (
        <SpeedDialAction
          key={action.value}
          icon={action.icon}
          tooltipTitle={action.tooltip}
          onClick={() => handleModeChange(action.value)}
          sx={{
            backgroundColor: action.value === mode ? "#f0f0f0" : "white",
            fontWeight: action.value === mode ? "bold" : "normal",
          }}
        />
      ))}
    </SpeedDial>
  );
}
