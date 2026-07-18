import React from "react";
import { useAtom } from "jotai";

import { MenuBarItem, SIcon } from "./ui";

import { viewingDescription } from "./atoms";

import { commands$ } from "./CommandsStream";
import { useIsMobile } from "./utils";

export function DescriptionButton({showLabel = false}) {
  const isMobileDevice = useIsMobile();
  const [active, setActive] = useAtom(viewingDescription);

  const toggle = () => {
    setActive(!active);
    commands$.showDescription();
  };

  return (
    <MenuBarItem onClick={toggle} active={active}>
      <SIcon name="info" />
      <br />
      {(isMobileDevice || showLabel) ? "Description" : null}
    </MenuBarItem>
  );
}
