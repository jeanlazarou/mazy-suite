import React, { useState } from "react";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import Divider from "@mui/material/Divider";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import KeyboardIcon from "@mui/icons-material/Keyboard";

function isMacOS() {
  return /Macintosh/.test(navigator.userAgent);
}

const CTRL = isMacOS() ? "⌃" : "Ctrl";
const SHIFT = isMacOS() ? "⇧" : "Shift";

const simpleKey = (command, ...keys) => ({ command, aliases: [keys] });

const aliasesKeys = (command, ...aliases) => ({ command, aliases });

const groups = [
  {
    title: "General",
    items: [
      simpleKey("Open a recording", "A"),
      simpleKey("Export the cleaned WAV", CTRL, "S"),
      simpleKey("Bypass: hear the original", "B"),
      simpleKey("Hear only what is removed", "R"),
      simpleKey("Waveform / level view", "V"),
    ],
  },
  {
    title: "Transport",
    items: [
      simpleKey("Play/Pause", "Space"),
      simpleKey("Move playback at the beginning", "Home"),
      simpleKey("Move playback position forward", "RightArrow"),
      simpleKey("Move playback position backward", "LeftArrow"),
      simpleKey("Memorize position", CTRL, "M"),
      simpleKey("Goto memorized position", CTRL, "G"),
    ],
  },
  {
    title: "Region",
    items: [
      simpleKey("Next region", "N"),
      simpleKey("Previous region", "P"),
      aliasesKeys("Insert", ["Insert"], ["I"]),
      simpleKey("Keep the change", "Enter"),
      simpleKey("Cancel the change", "Esc"),
      aliasesKeys("Delete (keep the audio)", ["Delete"], ["Backspace"]),
      simpleKey("Move to the left", SHIFT, "LeftArrow"),
      simpleKey("Move to the right", SHIFT, "RightArrow"),
      simpleKey("End later", "UpArrow"),
      simpleKey("End earlier", "DownArrow"),
      simpleKey("Start earlier", SHIFT, "DownArrow"),
      simpleKey("Start later", SHIFT, "UpArrow"),
      simpleKey("Start at playback position", "S"),
      aliasesKeys("End at playback position", ["End"], ["E"]),
    ],
  },
];

const style = {
  position: "fixed",
  left: "0.2em",
  bottom: "0.1em",
  fontSize: "3.4rem",
  cursor: "pointer",
};

const containerStyle = { display: "flex", padding: 20, gap: 20, justifyContent: "center", backgroundColor: "#e7e7e7" };
const columnStyle = { display: "flex", flexDirection: "column", gap: 20 };

const GroupTitle = ({ children }) => (
  <>
    <Typography variant="h6">{children}</Typography>
    <Divider sx={{ marginBottom: 1 }} />
  </>
);

export function HotkeysHelp() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <KeyboardIcon sx={style} onClick={() => setOpen(true)} />
      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md">
        <div style={containerStyle}>
          <div style={columnStyle}>
            <div>
              <GroupTitle>{groups[0].title}</GroupTitle>
              <HotkeysTable list={groups[0].items} />
            </div>
            <div>
              <GroupTitle>{groups[1].title}</GroupTitle>
              <HotkeysTable list={groups[1].items} />
            </div>
          </div>
          <div>
            <GroupTitle>{groups[2].title}</GroupTitle>
            <HotkeysTable list={groups[2].items} />
          </div>
        </div>
        <Typography variant="caption" color="text.secondary" sx={{ textAlign: "center", py: 1, backgroundColor: "#e7e7e7" }}>
          Vox Noise Gate v{__APP_VERSION__}
        </Typography>
      </Dialog>
    </>
  );
}

const HotkeysTable = ({ list }) => (
  <Table size="small" sx={{ backgroundColor: "white", borderRadius: 1 }}>
    <TableBody>
      {list.map((e, i) => (
        <TableRow key={i} sx={{ "&:nth-of-type(odd)": { backgroundColor: "action.hover" } }}>
          <TableCell>{e.command}</TableCell>
          <TableCell>
            <Shortcut aliases={e.aliases} />
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);

const Shortcut = ({ aliases }) => {
  const shortcut = (keys) =>
    keys.map((k, i) => (
      <React.Fragment key={`${i}-${k}`}>
        {i > 0 ? "+ " : ""}
        <Chip size="small" sx={{ borderRadius: "4px" }} label={k} />
      </React.Fragment>
    ));

  return aliases.map((keys, i) => (
    <React.Fragment key={i}>
      {i > 0 ? "/ " : ""}
      {shortcut(keys)}
    </React.Fragment>
  ));
};
