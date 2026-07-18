import React from "react";

import { MenuBarItem, SIcon } from "./ui";

import { commands$ } from "./CommandsStream";

import { usePlaybackState } from "./Sequencer";

export function PlaybackButtons() {
  const playbackState = usePlaybackState();

  const playColor = playbackState !== "idle" ? "red" : undefined;
  const playIcon = playbackState === "playing" ? "pause" : "play";

  const playAction =
    playbackState === "idle" || playbackState === "paused"
      ? () => commands$.play()
      : () => commands$.pause();

  return (
    <>
      <MenuBarItem onClick={() => commands$.playPrevious()}>
        <SIcon name="step backward" />
      </MenuBarItem>
      <MenuBarItem id="play-button" onClick={playAction}>
        <SIcon name={playIcon} color={playColor} />
      </MenuBarItem>
      <MenuBarItem onClick={() => commands$.stop()}>
        <SIcon name="stop" />
      </MenuBarItem>
      <MenuBarItem onClick={() => commands$.playNext()}>
        <SIcon name="step forward" />
      </MenuBarItem>
    </>
  );
}
