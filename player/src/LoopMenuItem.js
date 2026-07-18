import React from "react";
import { useAtom } from "jotai";

import { MenuBarItem, SIcon, SLabel } from "./ui";

import { playbackMode } from "./atoms";
import { options$ } from "./OptionsStream";
import { loopOptions } from "./OptionsStore";
import { useIsMobile } from "./utils";

const mobileStyle = { top: 22, left: 29 }
const desktopStyle = { top: 31, left: 32 }

export function LoopMenuItem({ disabled }) {
  const [loopOption, nextLoopOption] = useAtom(playbackMode);

  const isMobileDevice = useIsMobile();

  const changeOption = (ev) => {
    ev.stopPropagation();

    const index = (loopOption + 1) % loopOptions.length;

    nextLoopOption(index);

    options$.playbackMode(loopOptions[index].value);
  };

  const style = isMobileDevice
    ? mobileStyle
    : desktopStyle

  return (
    <MenuBarItem onClick={changeOption} disabled={disabled} style={{ position: "relative" }}>
      <SIcon name="retweet" />

      <SLabel color="grey" floating style={style} size="mini">
        {loopOptions[loopOption].label}
      </SLabel>
    </MenuBarItem>
  );
}
