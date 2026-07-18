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
import { dismissRegion } from "./actions/dismiss_region";

const modes = [
  {
    icon: <EditIcon />,
    name: "Edit Mode",
    value: "edit",
    tooltip: "Click regions to edit timing"
  },
  {
    icon: <ContentCutIcon />,
    name: "Split Mode",
    value: "split",
    tooltip: "Click regions to split them"
  },
  {
    icon: <DeleteIcon />,
    name: "Delete Mode",
    value: "delete",
    tooltip: "Click regions to delete them"
  },
];

export function ModeSpeedDial() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useAtom(editorMode);

  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  const handleModeChange = useAtomCallback(async (get, set, newMode) => {
    // Unselect any selected region when changing modes (like pressing Escape)
    await dismissRegion(get, set);

    setMode(newMode);
    handleClose();
  });

  const currentMode = modes.find(m => m.value === mode);

  return (
    <SpeedDial
      ariaLabel="Editor mode speed dial"
      sx={{
        position: "fixed",
        bottom: 16,
        right: 16,
        "& .MuiFab-primary": {
          backgroundColor: mode === "edit" ? "#2185d0" : mode === "split" ? "#f2711c" : "#db2828",
          "&:hover": {
            backgroundColor: mode === "edit" ? "#1678c2" : mode === "split" ? "#e26202" : "#ca1010",
          }
        }
      }}
      icon={<SpeedDialIcon icon={currentMode?.icon} />}
      onClose={handleClose}
      onOpen={handleOpen}
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
