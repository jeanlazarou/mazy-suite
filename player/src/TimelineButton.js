import React from "react";
import { useAtom } from "jotai";

import { MenuBarItem, SIcon } from "./ui";

import { showTimeline, viewingDescription } from "./atoms";

import { commands$ } from "./CommandsStream";

export function TimelineButton() {
  const [active, setActive] = useAtom(showTimeline);
  const [descViewActive, setDescViewActive] = useAtom(viewingDescription);

  const toggle = () => {
    const goingToBeActive = !active;

    setActive(goingToBeActive);

    if (goingToBeActive && !descViewActive) {
      setDescViewActive(true);
      commands$.showDescription();
    }
  };

  return (
    <MenuBarItem onClick={toggle} active={active}>
      <SIcon name="history" />
      <br />
      Timeline
    </MenuBarItem>
  );
}
