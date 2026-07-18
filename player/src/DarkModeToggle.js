import { atom, useAtom } from "jotai";
import React, { useEffect } from "react";
import Switch from "@mui/material/Switch";

import { SIcon } from "./ui";
import { OptionsStore } from "./OptionsStore";

export const darkMode = atom(OptionsStore.restore().darkMode);

export function DarkModeToggle() {
  const [isDark, setDarkMode] = useAtom(darkMode);

  useEffect(() => {
    changeTheme(isDark);
    OptionsStore.save({ darkMode: isDark });
  }, [isDark]);

  return (
    <div id="dark-mode-toggle">
      <SIcon name="sun" size="tiny" />
      <Switch
        size="small"
        checked={isDark}
        onChange={() => setDarkMode(!isDark)}
      />
      <SIcon name="moon" size="tiny" />
    </div>
  );
}

export function changeTheme(darkMode) {
  const modal = document.querySelectorAll(".player-modal");
  const subtitles = document.querySelectorAll(".lyrics > .message");

  if (darkMode) {
    document.body.classList.add("dark");
    document.body.style.backgroundColor = "#1b1c1d";

    modal.forEach((e) => e.classList.add("modal-dark-mode"));
    subtitles.forEach((e) => e.classList.add("lyrics-dark-mode"));
  } else {
    document.body.classList.remove("dark");
    document.body.style.backgroundColor = "";

    modal.forEach((e) => e.classList.remove("modal-dark-mode"));
    subtitles.forEach((e) => e.classList.remove("lyrics-dark-mode"));
  }
}
