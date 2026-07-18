import { useState } from "react";
import { useAtom, useAtomValue } from "jotai";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";

import { toMarkers } from "./utils";
import { currentSong } from "./Lyrics";
import { parseLyrics } from "./srt_parser";
import { audioEngine } from "./Waveform";

function clickFileOpen() {
  document.querySelector("#load-file").click();
}

export async function readSubtitles(title, file) {
  return new Promise((success, failure) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const content = e.target.result;
      const { lyricsData, anomalies } = parseLyrics(title, content);

      if (anomalies.invalid) {
        failure({ message: "Invalid subtitles file", cause: anomalies });
      } else {
        success(lyricsData);
      }
    };

    reader.readAsText(file);
  });
}

export function OpenBox({ open, onClose }) {
  const [fileName, setFileName] = useState("");
  const [lyricsData, setLyricsData] = useState();

  const engine = useAtomValue(audioEngine);
  const [song, setSong] = useAtom(currentSong);

  const fileSelected = async (event) => {
    const file = event.target.files[0];

    setFileName(file.name);

    try {
      const data = await readSubtitles(song.title, file);

      setLyricsData(data);
    } catch (error) {
      alert(error.message);
    }
  };

  const done = () => {
    if (lyricsData) {
      const newSong = {
        title: song.title,
        lyrics: lyricsData.lyrics,
        timings: lyricsData.timings,
        savedTimings: lyricsData.savedTimings,
      };

      setSong(newSong);

      engine.setMarkers(toMarkers(newSong.timings, newSong.savedTimings));

      onClose();
    }
  };

  return (
    <Dialog open={!!open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        Load subtitles for song <i>{song.title}</i>
      </DialogTitle>
      <DialogContent>
        <div className="file-path">
          <TextField
            label="File Name"
            placeholder="File to open"
            fullWidth
            size="small"
            margin="dense"
            value={fileName}
            slotProps={{ input: { readOnly: true } }}
          />
          <input
            id="load-file"
            type="file"
            accept=".srt"
            onChange={fileSelected}
            style={{ display: "none" }}
          />
          <IconButton aria-label="browse" onClick={clickFileOpen}>
            <FolderOpenIcon />
          </IconButton>
        </div>
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="success"
          onClick={done}
          disabled={!lyricsData}
        >
          Open
        </Button>
      </DialogActions>
    </Dialog>
  );
}
