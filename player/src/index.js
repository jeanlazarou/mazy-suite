import React, { useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { useAtom, useAtomValue } from "jotai";
import { createTheme, ThemeProvider } from "@mui/material/styles";

import { VERSION } from "./features";
import { isConfig, params } from "./params";

import "./index.css";

import { currentPlaylistUrl } from "./atoms";

import { Albums } from "./Albums";
import { SetsGate } from "./SetsGate";
import { Config } from "./Config";
import { darkMode } from "./DarkModeToggle";
import { listAddress } from "./api";

console.info(`${VERSION.name} version ${VERSION.version}`);

function Main() {
  const [playlistUrl, setPlaylistUrl] = useAtom(currentPlaylistUrl);

  const list = global.features.defaultList
    ? "default"
    : params("list", undefined);

  useEffect(() => {
    if (playlistUrl === null) {
      setPlaylistUrl(listAddress(list));
    }
  }, [list, playlistUrl, setPlaylistUrl]);

  // the albums browser is a light-styled view; don't let the player's
  // dark-mode preference turn MUI inputs white-on-white there
  return list ? (
    <SetsGate />
  ) : (
    <ThemeProvider theme={lightTheme}>
      <Albums />
    </ThemeProvider>
  );
}

const lightTheme = createTheme({ palette: { mode: "light" } });

// MUI components (dialogs, inputs…) follow the app's dark-mode atom
function Themed({ children }) {
  const isDark = useAtomValue(darkMode);

  const theme = useMemo(
    () => createTheme({ palette: { mode: isDark ? "dark" : "light" } }),
    [isDark]
  );

  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Themed>{isConfig() ? <Config /> : <Main />}</Themed>
  </React.StrictMode>
);

// Unregister any service worker left behind by the old create-react-app setup.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.ready
    .then((registration) => registration.unregister())
    .catch(() => {});
}
