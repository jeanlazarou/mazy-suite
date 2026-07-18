import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";

import { currentSong } from "./Lyrics";

import { srtSubtitles } from "./actions/save_request";

function saveFile(fileName, content) {
  var myBlob = new Blob([content], { type: "text/plain" });

  const hasExtension = fileName.match(/[.]srt$/i);

  var url = window.URL.createObjectURL(myBlob);
  var anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = hasExtension ? fileName : `${fileName}.srt`;

  anchor.click();
  window.URL.revokeObjectURL(url);
}

export function SaveBox({ open, onClose }) {
  const song = useAtomValue(currentSong);
  const content = useAtomValue(srtSubtitles);
  const [fileName, setFileName] = useState("");

  useEffect(() => {
    setFileName(song.title);
  }, [setFileName, song.title]);

  return (
    <Dialog open={!!open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>
        Save song <i>{song.title}</i>
      </DialogTitle>
      <DialogContent>
        <TextField
          label="File Name"
          placeholder="File Name"
          required
          fullWidth
          size="small"
          margin="dense"
          value={fileName}
          onChange={(e) => setFileName(e.target.value)}
        />
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="success"
          onClick={() => {
            saveFile(fileName, content);
            onClose();
          }}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
