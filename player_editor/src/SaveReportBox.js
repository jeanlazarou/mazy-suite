import { useState } from "react";
import { useAtomValue } from "jotai";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Typography from "@mui/material/Typography";

import { currentSong } from "./Lyrics";
import { toSMPTETimecode } from "./utils";

const plural = (count, word) => `${count} ${word}${count > 1 ? "s" : ""}`;

const range = ({ start, end }) =>
  `${toSMPTETimecode(start)} --> ${toSMPTETimecode(end)}`;

function Problem({ title, items }) {
  if (items.length === 0) return null;

  return (
    <>
      <Typography variant="subtitle2" sx={{ marginTop: 2 }}>
        {title}
      </Typography>
      <ul style={{ margin: 0 }}>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </>
  );
}

export function SaveReportBox({ report, onCancel, onFix }) {
  // Mounted only while shown, so "copied" starts over each time
  return report ? (
    <Report report={report} onCancel={onCancel} onFix={onFix} />
  ) : null;
}

function Report({ report, onCancel, onFix }) {
  const song = useAtomValue(currentSong);
  const [copied, setCopied] = useState(undefined);

  const copyLyrics = () => {
    navigator.clipboard
      .writeText(song.lyrics.join("\n"))
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };

  const {
    regionsWithoutLine,
    regionsWithEmptyLine,
    linesWithoutRegion,
  } = report;

  return (
    <Dialog open onClose={onCancel} fullWidth maxWidth="sm">
      <DialogTitle>
        Save song <i>{song.title}</i>
      </DialogTitle>
      <DialogContent dividers>
        <DialogContentText>
          The regions and the lyrics lines do not match. <b>Fix and save</b>{" "}
          leaves the following out of the file; the editor keeps them.
        </DialogContentText>
        <Problem
          title={`${plural(regionsWithoutLine.length, "region")} without a lyrics line`}
          items={regionsWithoutLine.map(range)}
        />
        <Problem
          title={`${plural(regionsWithEmptyLine.length, "region")} with an empty line (the line goes too)`}
          items={regionsWithEmptyLine.map(range)}
        />
        <Problem
          title={`${plural(linesWithoutRegion.length, "line")} without a region`}
          items={linesWithoutRegion}
        />
        {linesWithoutRegion.length > 0 && (
          <DialogContentText sx={{ marginTop: 2 }}>
            To go on later, copy the lyrics and paste them back in the lyrics
            panel after loading the saved file.
          </DialogContentText>
        )}
      </DialogContent>
      <DialogActions>
        <Button
          color="inherit"
          sx={{ marginRight: "auto" }}
          onClick={copyLyrics}
        >
          {copied === true
            ? "Lyrics copied"
            : copied === false
            ? "Copy failed"
            : "Copy lyrics"}
        </Button>
        <Button color="inherit" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="contained" color="success" onClick={onFix}>
          Fix and save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
