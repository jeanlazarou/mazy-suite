import { useState } from "react";
import { useSetAtom } from "jotai";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";

import { currentTrack } from "./Editor";
import { currentSong } from "./Lyrics";
import { readSubtitles } from "./OpenBox";

function clickFileOpen(domId) {
  document.querySelector(`#${domId}`).click();
}

function FileField({ label, inputId, fileName, accept, onSelected }) {
  return (
    <div className="file-path">
      <TextField
        label={label}
        placeholder="File to open"
        fullWidth
        size="small"
        margin="dense"
        value={fileName}
        slotProps={{ input: { readOnly: true } }}
      />
      <input
        id={inputId}
        type="file"
        accept={accept}
        onChange={onSelected}
        style={{ display: "none" }}
      />
      <IconButton aria-label="browse" onClick={() => clickFileOpen(inputId)}>
        <FolderOpenIcon />
      </IconButton>
    </div>
  );
}

export function OpenProjectBox({ open, onClose }) {
  const setSong = useSetAtom(currentSong);
  const setCurrentTrack = useSetAtom(currentTrack);

  const [audioFile, setAudioFile] = useState();
  const [audioFileName, setAudioFileName] = useState("");

  const [lyricsFileName, setLyricsFileName] = useState("");
  const [lyricsData, setLyricsData] = useState();

  const lyricFileSelected = async (event) => {
    const file = event.target.files[0];

    setLyricsFileName(file.name);

    try {
      const data = await readSubtitles(file.name, file);

      setLyricsData(data);
    } catch (error) {
      alert(error.message);
    }
  };

  const audioSelected = async (event) => {
    const file = event.target.files[0];

    setAudioFile(file);
    setAudioFileName(file.name);
  };

  const done = () => {
    const song = {};

    song.title = audioFileName;

    if (lyricsData) {
      song.title = lyricsFileName;
      song.lyrics = lyricsData.lyrics;
      song.timings = lyricsData.timings;
      song.savedTimings = lyricsData.savedTimings;
    } else {
      song.lyrics = [];
      song.timings = [];
      song.savedTimings = new Set();
    }

    setSong(song);

    const track = {
      title: song.title,
      file: audioFile,
    };

    setCurrentTrack(track);

    onClose(track);
  };

  return (
    <Dialog open={!!open} onClose={() => onClose(null)} fullWidth maxWidth="sm">
      <DialogTitle>Load project</DialogTitle>
      <DialogContent>
        <FileField
          label="Audio file"
          inputId="audio-file"
          fileName={audioFileName}
          accept=".mp3, .wav"
          onSelected={audioSelected}
        />

        <FileField
          label="Lyrics file"
          inputId="lyrics-file"
          fileName={lyricsFileName}
          accept=".srt"
          onSelected={lyricFileSelected}
        />
      </DialogContent>
      <DialogActions>
        <Button color="inherit" onClick={() => onClose(null)}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color="success"
          onClick={done}
          disabled={!audioFile}
        >
          Open
        </Button>
      </DialogActions>
    </Dialog>
  );
}
