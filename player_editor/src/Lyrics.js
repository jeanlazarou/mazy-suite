import { sortedIndexBy } from "lodash";
import { atom, useAtom, useAtomValue } from "jotai";
import { useEffect, useState } from "react";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";

import { loadLyrics } from "./api";
import { audioPosition, visibleMarkers } from "./Waveform";
import { isPositionAfterTiming, markerLabel } from "./utils";

export const currentSong = atom({ position: 0, timings: [], lyrics: [], title: "" });

export const editingLyrics = atom(false);

export const currentDuration = atom(0);

export const srtFileErrors = atom(0);

export function Lyrics({ track }) {
  const position = useAtomValue(audioPosition);
  const markersVisible = useAtomValue(visibleMarkers);

  const [song, setSong] = useAtom(currentSong);
  const [editing, setEditing] = useAtom(editingLyrics);

  const [activeVerse, setActiveVerse] = useState();
  const [lyrics, setLyrics] = useState();

  useEffect(() => {
    if (!track) return;
    if (track.file) return;

    const load = async () => {
      const { lyricsData, anomalies } = await loadLyrics(track.title);

      if (anomalies.invalid) console.error("Invalid SRT file", anomalies);

      if (lyricsData) {
        setSong({
          title: track.title,
          lyrics: lyricsData.lyrics,
          timings: lyricsData.timings,
          savedTimings: lyricsData.savedTimings,
        });
      } else {
        setSong({
          lyrics: [],
          timings: [],
          title: track.title,
          savedTimings: new Set(),
        });
      }
    };

    load();
  }, [track, setSong]);

  useEffect(() => {
    if (song.lyrics.length === 0) return;

    const { timings } = song;

    let next = null;

    let i = sortedIndexBy(timings, [position], (e) => e[0]);

    let timing = song.timings[i];

    if (timing && timing[1] !== null) {
      if (isPositionAfterTiming(position, timing[0])) next = timing[1] - 1;
    } else {
      timing = song.timings[i - 1];

      if (timing && timing[1] !== null) {
        if (isPositionAfterTiming(position, timing[0])) next = timing[1] - 1;
      }
    }

    if (next !== activeVerse) setActiveVerse(next);
  }, [activeVerse, song, position]);

  useEffect(() => {
    const current = document.querySelector(".active-verse");

    if (current) {
      current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "nearest",
      });
    }
  }, [activeVerse]);

  const edit = () => {
    setLyrics(song.lyrics.join("\n"));
    setEditing(true);
  };
  const accept = () => {
    setSong({ ...song, lyrics: lyrics.split("\n") });

    setEditing(false);
  };
  const cancel = () => {
    setEditing(false);
  };
  const onChange = (e) => {
    setLyrics(e.target.value);
  };

  return (
    <div className="lyrics-panel">
      {editing ? (
        <>
          <textarea
            className="lyrics-textarea"
            value={lyrics}
            onChange={onChange}
          />
          <div className="ok-cancel-buttons">
            <IconButton aria-label="accept" onClick={accept}>
              <CheckIcon />
            </IconButton>
            <IconButton aria-label="cancel" onClick={cancel}>
              <CloseIcon />
            </IconButton>
          </div>
        </>
      ) : (
        <div className="lyrics-input">
          <div className="edit-button">
            <EditIcon onClick={edit} sx={{ cursor: "pointer" }} />
          </div>
          {song.lyrics.map((line, i) => (
            <div
              key={i}
              style={{ paddingLeft: "0.3em" }}
              className={activeVerse === i ? "active-verse" : undefined}
            >
              {markersVisible && (
                <Chip
                  size="small"
                  color="error"
                  label={markerLabel(i)}
                  sx={{
                    verticalAlign: "middle",
                    marginRight: "13px",
                    height: 18,
                    fontSize: "0.75em",
                    borderRadius: "4px",
                  }}
                />
              )}
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
