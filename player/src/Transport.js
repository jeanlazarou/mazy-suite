import React from "react";

import { MenuBarItem } from "./ui";
import { Waveform } from "./Waveform";
import { LoopMenuItem } from "./LoopMenuItem";
import { PlaybackButtons } from "./PlaybackButtons";

export function Transport(props) {
  return (
    <>
      <LoopMenuItem />

      <PlaybackButtons />

      <MenuBarItem style={props.basic ? { display: "none" } : undefined}>
        <Waveform id="waveform" />
      </MenuBarItem>
    </>
  );
}
