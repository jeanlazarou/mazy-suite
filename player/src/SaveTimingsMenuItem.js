import React from "react";
import { useAtomValue } from "jotai";

import { MenuBarItem, SIcon } from "./ui";
import { songsLyrics } from "./LyricsSubtitle";

import { Saver } from "./Saver";
import { playingTrack } from "./Sequencer";

export function SaveTimingsMenuItem() {
  const current = useAtomValue(playingTrack);
  const song = useAtomValue(songsLyrics(current.title));

  const saveTimings = () => {
    const data = {
      [current.title]: song,
    };

    Saver.save(data);
  };

  return (
    <MenuBarItem onClick={saveTimings} disabled={song === undefined}>
      <SIcon name="save" />
    </MenuBarItem>
  );
}
