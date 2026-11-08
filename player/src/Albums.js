import React, { useEffect, useMemo, useState } from "react";
import { useAtom } from "jotai";
import useMediaQuery from "@mui/material/useMediaQuery";
import { createTheme, ThemeProvider } from "@mui/material/styles";

import { asReadyList, loadAlbums } from "./api";

import { AlbumsList } from "./AlbumsList";
import { CustomListBuilder } from "./CustomListBuilder";

import { Player } from "./Player";
import { changeTheme } from "./DarkModeToggle";
import { customPlaylist, currentPlaylistUrl } from "./atoms";

function playlistPeriod(period) {
  const from = new Date(Date.parse(period.from));
  const to = new Date(Date.parse(period.to));

  return {
    from: from.getFullYear(),
    to: to.getFullYear(),
    human:
      from.getFullYear() === to.getFullYear()
        ? `${from.getFullYear()}`
        : `${from.getFullYear()} - ${to.getFullYear()}`,
  };
}

export function Albums() {
  const [playlists, setPlaylists] = useState([]);
  const [sortedList, setSortedLists] = useState([]);
  const [creatingList, setCreateList] = useState(false);
  const [playingList, setPlayingList] = useState(false);
  const [availableColors, setColors] = useState([]);
  const [defaultList, setDefaultList] = useState();

  const [, setCustomPlaylist] = useAtom(customPlaylist);
  const [, setPlaylistUrl] = useAtom(currentPlaylistUrl);

  const systemDark = useMediaQuery("(prefers-color-scheme: dark)", { noSsr: true });

  const theme = useMemo(
    () => createTheme({ palette: { mode: systemDark ? "dark" : "light" } }),
    [systemDark]
  );

  // the albums views follow the system's dark mode, and declaring it keeps
  // browsers' forced dark from recoloring them; the player has its own switch
  useEffect(() => {
    if (playingList) return;

    changeTheme(systemDark);

    const root = document.documentElement.style;

    root.colorScheme = "light dark";

    return () => root.removeProperty("color-scheme");
  }, [playingList, systemDark]);

  useEffect(() => {
    if (playlists.length > 0) return;

    loadAlbums().then((albums) => {
      setSortedLists(
        albums
          .map((data) => {
            const period = playlistPeriod(data.playlist.period);

            return { ...data, period };
          })
          .sort((a, b) => {
            const comp = a.period.to - b.period.to;

            return comp === 0 ? a.period.from - b.period.from : comp;
          })
      );

      let colorSet = albums.reduce((set, album) => {
        set.add(album.color ? album.color : "white");
        return set;
      }, new Set());

      setColors([...colorSet.values()]);

      setPlaylists(albums);
    });
  }, [playlists]);

  const startPlay = (playlist) => {
    setCreateList(false);

    if (!playlist) return;

    setPlayingList(true);
    setPlaylistUrl("custom:");
    setCustomPlaylist(asReadyList(playlist));
  };

  const loadList = (playlist) => {
    if (!playlist) return;

    setDefaultList(playlist);
    setCreateList(true);
  };

  if (playingList && !creatingList) return <Player />;

  return (
    <ThemeProvider theme={theme}>
      {creatingList ? (
        <CustomListBuilder
          playlists={playlists}
          open={creatingList}
          onDone={startPlay}
          defaultList={defaultList}
        />
      ) : (
        <AlbumsList
          onLoad={loadList}
          onPlay={startPlay}
          sortedList={sortedList}
          availableColors={availableColors}
          onCreate={() => setCreateList(true)}
        />
      )}
    </ThemeProvider>
  );
}
