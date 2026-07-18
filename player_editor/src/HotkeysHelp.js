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
  const userAgent = navigator.userAgent;
  return /Macintosh/.test(userAgent);
}

const CTRL = isMacOS ? "⌃" : "Ctrl";
const SHIFT = isMacOS ? "⇧" : "Shift";

const simpleKey = (command, ...keys) => {
  return { command, aliases: [keys] }
}

const aliasesKeys = (command, ...aliases) => {
  return { command, aliases }
}

const groups = [{
  title: "General", items: [
    simpleKey("Check overlaps", CTRL, "V"),
    simpleKey("Load audio & subtitles file", "A"),
    simpleKey("Load subtitles file", CTRL, "O"),
    simpleKey("Save subtitles file", CTRL, "S"),
    simpleKey("Toggle markers", CTRL, "P"),
  ]
}, {
  title: "Transport", items: [
    simpleKey("Goto memorized position", CTRL, "G"),
    simpleKey("Memorize position", CTRL, "M"),
    simpleKey("Move playback at the beginning", "Home"),
    simpleKey("Move playback position forward", "RightArrow"),
    simpleKey("Move playback position backward", "LeftArrow"),
    simpleKey("Play/Pause", "Space"),
  ]
}, {
  title: "Region", items: [
    simpleKey("Accept change", "Enter"),
    simpleKey("Hide (cancel change)", "Esc"),
    simpleKey("Decrease lower ", SHIFT, "DownArrow"),
    simpleKey("Decrease upper", "DownArrow"),
    simpleKey("Drop (while playing)", CTRL, "I"),
    simpleKey("Duplicate", CTRL, "D"),
    simpleKey("Increase upper", "UpArrow"),
    simpleKey("Increase lower", SHIFT, "DownArrow"),
    aliasesKeys("Insert", ["Insert"], ["I"]),
    simpleKey("Move to the left", SHIFT, "LeftArrow"),
    simpleKey("Move to the right", SHIFT, "RightArrow"),
    simpleKey("Select", "S"),
    simpleKey("Shift", SHIFT, "S"),
  ]
}]

const style = {
  position: "fixed",
  left: "0.2em",
  bottom: "0.1em",
  fontSize: "3.4rem",
  cursor: "pointer",
}

const containerStyle = { display: "flex", padding: 20, gap: 20, justifyContent: "center", backgroundColor: "#e7e7e7" }
const columnStyle = { display: "flex", flexDirection: "column", gap: 20 }

const GroupTitle = ({ children }) => (
  <>
    <Typography variant="h6">{children}</Typography>
    <Divider sx={{ marginBottom: 1 }} />
  </>
)

export function HotkeysHelp() {
  const [open, setOpen] = useState(false)

  return <>
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
    </Dialog>
  </>

}

const HotkeysTable = ({ list }) => {

  return (
    <Table size="small" sx={{ backgroundColor: "white", borderRadius: 1 }}>
      <TableBody>
        {list.map((e, i) => {
          return (
            <TableRow
              key={i}
              sx={{ "&:nth-of-type(odd)": { backgroundColor: "action.hover" } }}
            >
              <TableCell>{e.command}</TableCell>
              <TableCell>
                <Shortcut aliases={e.aliases} />
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

const Shortcut = ({ aliases }) => {
  const shortcut = (keys) => {
    return keys.map((k, i) => (
      <React.Fragment key={`{i}-{k}`}>
        {i > 0 ? "+ " : ""}
        <Chip size="small" sx={{ borderRadius: "4px" }} label={k} />
      </React.Fragment>
    ))
  }

  return aliases.map((keys, i) => {
    return <React.Fragment key={i}>
      {i > 0 ? "/ " : ""}
      {shortcut(keys)}
    </React.Fragment>
  });
}
