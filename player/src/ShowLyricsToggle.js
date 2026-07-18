import React from "react";
import { useAtom } from "jotai";

import { MenuBarItem, SIcon, SIconGroup } from "./ui";

import { lyricsActive } from "./atoms";

import { options$ } from "./OptionsStream";
import { useIsMobile } from "./utils";

export function ShowLyricsToggle({showLabel = false}) {
  const isMobileDevice = useIsMobile();
  const [lyrics, setLyrics] = useAtom(lyricsActive);

  const active = isMobileDevice ? lyrics : undefined;
  const color = lyrics ? "blue" : undefined;

  return (
    <MenuBarItem
      active={active}
      onClick={() => {
        setLyrics(!lyrics);
        options$.lyricsActive(!lyrics);
      }}
    >
      <>
        <SIconGroup size="large">
          <SIcon id="lyrics" name="music" color={color} />
          <SIcon
            name="bars"
            color={color}
            style={{
              position: "absolute",
              right: "-0.2em",
              bottom: "-0.2em",
              fontSize: "0.5em",
            }}
          />
        </SIconGroup>
        {(isMobileDevice || showLabel) && (
          <>
            <br />
            Lyrics
          </>
        )}
      </>
    </MenuBarItem>
  );
}
