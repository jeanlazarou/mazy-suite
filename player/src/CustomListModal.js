import React from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";

import { SIcon } from "./ui";
import { createSaveLink } from "./utils";

export function CustomListModal({
  name,
  setName,
  open,
  onClose,
  allSongs,
  selected,
}) {
  return (
    <Dialog fullWidth maxWidth="xs" onClose={() => onClose()} open={open}>
      <DialogTitle>Save Custom Playlist</DialogTitle>
      <DialogContent>
        <TextField
          fullWidth
          size="small"
          margin="dense"
          label="Playlist name"
          placeholder="playlist name"
          onChange={(ev) => setName(ev.target.value)}
          value={name}
        />
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={() => onClose()}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="success"
          endIcon={<SIcon name="checkmark" />}
          onClick={() => {
            const [, a] = createSaveLink(name, allSongs, selected);

            a.click();

            onClose();
          }}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
