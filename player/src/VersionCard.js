import React from "react";

import { MenuBarItem, SLabel } from "./ui";

export function VersionCard() {
  return (
    <MenuBarItem disabled>
      <SLabel color="purple">Ver. {global.version}</SLabel>
    </MenuBarItem>
  );
}
