import { useState } from "react";
import { useAtomValue } from "jotai";
import { useAtomCallback } from "jotai/utils";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";

import { currentRecording } from "./Editor";
import { formatDuration } from "./utils";
import { renderedRegions } from "./actions/regions";
import { FORMATS, exportFileName, exportRecording, sourceFormat } from "./actions/export_request";

function ExportForm({ recording, onClose }) {
  const rendered = useAtomValue(renderedRegions);
  const [fileName, setFileName] = useState(exportFileName(recording));
  const [format, setFormat] = useState(sourceFormat(recording));
  const [busy, setBusy] = useState(false);

  const save = useAtomCallback(async (get, set) => {
    setBusy(true);

    // let the button show it is working before the render blocks the page
    await new Promise((resolve) => setTimeout(resolve, 20));

    try {
      await exportRecording(get, set, { fileName, format });
      onClose();
    } finally {
      setBusy(false);
    }
  });

  const silenced = rendered.reduce((total, r) => total + (r.end - r.start), 0);
  const source = recording.wav
    ? `${recording.float ? "32-bit float" : `${recording.bitDepth}-bit`} WAV`
    : "decoded by the browser";

  return (
    <>
      <DialogTitle>
        Export <i>{recording.name}</i>
      </DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 1 }}>
          {rendered.length} region{rendered.length === 1 ? "" : "s"} silenced, {formatDuration(silenced)} in all.
          Source: {source}, {recording.sampleRate} Hz, {recording.channels.length === 1 ? "mono" : `${recording.channels.length} channels`}.
        </DialogContentText>
        <TextField
          label="File name"
          required
          fullWidth
          size="small"
          margin="dense"
          value={fileName}
          onChange={(e) => setFileName(e.target.value)}
        />
        <TextField
          select
          label="Format"
          fullWidth
          size="small"
          margin="dense"
          value={format}
          onChange={(e) => setFormat(e.target.value)}
        >
          {Object.entries(FORMATS).map(([key, f]) => (
            <MenuItem key={key} value={key}>
              WAV {f.label}
              {key === sourceFormat(recording) && recording.wav ? " (as recorded)" : ""}
            </MenuItem>
          ))}
        </TextField>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="contained" color="success" onClick={save} disabled={busy || !fileName.trim()}>
          {busy ? "Rendering…" : "Export"}
        </Button>
      </DialogActions>
    </>
  );
}

export function ExportBox({ open, onClose }) {
  const recording = useAtomValue(currentRecording);

  return (
    <Dialog open={!!open && !!recording} onClose={onClose} fullWidth maxWidth="xs">
      {recording ? <ExportForm key={recording.name} recording={recording} onClose={onClose} /> : null}
    </Dialog>
  );
}
