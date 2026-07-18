import React, { useLayoutEffect, useState } from "react";
import { atom, useSetAtom } from "jotai";
import Slider from "@mui/material/Slider";

import "./VolumeCard.css";

import { SIcon } from "./ui";
import { currentPlaylist } from "./atoms";

import { Sequencer } from "./Sequencer";
import { historyPush } from "./HistoryMachine";
import { BasicTrackCard } from "./BasicTrackCard";

const volumeChanger = atom(null, (get, set, track) => {
  const playlist = get(currentPlaylist);

  set(historyPush, playlist);

  const list = playlist.map((e) => (e.url === track.url ? track : e));

  set(currentPlaylist, list);

  Sequencer.changeVolume(track);
});

function VolumeSlider({ onChange, value }) {
  const [volume, setVolume] = useState(value);

  useLayoutEffect(() => {
    setVolume(value);
  }, [value]);

  return (
    <div
      className="track-volume"
      onClick={(ev) => ev.stopPropagation()}
      onPointerDown={(ev) => ev.stopPropagation()}
    >
      <SIcon name="volume up" className="track-volume-icon" />
      <Slider
        size="small"
        min={0}
        max={100}
        value={volume}
        valueLabelDisplay="auto"
        onChange={(_ev, v) => setVolume(v)}
        onChangeCommitted={(_ev, v) => onChange(v)}
        sx={{
          color: "#667eea",
          "& .MuiSlider-thumb": {
            width: 16,
            height: 16,
            backgroundColor: "white",
            border: "3px solid #667eea",
          },
          "& .MuiSlider-rail": { opacity: 0.25 },
        }}
      />
      <span className="track-volume-value">{volume}</span>
    </div>
  );
}

export function VolumeCard({ track, color }) {
  const changeVolume = useSetAtom(volumeChanger);

  return (
    <BasicTrackCard track={track} color={color} disabled>
      <VolumeSlider
        value={track.volume}
        onChange={(volume) => changeVolume({ ...track, volume })}
      />
    </BasicTrackCard>
  );
}
