import React from "react";

import { MenuBarItem, SIcon } from "./ui";

export function MenuItem({ active, icon, label, onClick }) {
  return (
    <MenuBarItem active={active} onClick={onClick}>
      {typeof icon === "string" ? <SIcon name={icon} /> : icon}

      <br />
      <div>{label}</div>
    </MenuBarItem>
  );
}
