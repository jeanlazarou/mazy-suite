import React, { useEffect, useState } from "react";
import { useAtom } from "jotai";

import { asReadyList, loadAlbums } from "./api";

import { AlbumsList } from "./AlbumsList";
import { CustomListBuilder } from "./CustomListBuilder";

import { Player } from "./Player";
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

  return creatingList ? (
    <CustomListBuilder
      playlists={playlists}
      open={creatingList}
      onDone={startPlay}
      defaultList={defaultList}
    />
  ) : playingList ? (
    <Player />
  ) : (
    <AlbumsList
      onLoad={loadList}
      onPlay={startPlay}
      sortedList={sortedList}
      availableColors={availableColors}
      onCreate={() => setCreateList(true)}
    />
  );
}
